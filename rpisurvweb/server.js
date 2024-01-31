#!/usr/bin/env node
const express = require('express');
const session = require('cookie-session');
const bodyParser = require('body-parser');
const $ = require('jquery');
const fs = require('fs');
const path = require('path');
const ini = require('ini');
const ejs = require('ejs');
const helpers = require('./public/assets/scripts/helpers');
const xmlbuilder = require('xmlbuilder');
const xml2js = require('xml2js');
const yaml = require('js-yaml');
const Stream = require('node-rtsp-stream');
const http = require('http');
const WebSocket = require('ws');
const axios = require('axios');
const { exec } = require('child_process');
const si = require('systeminformation');

const app = express();
const PORT = 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server});
const logServer = http.createServer();
const logWss = new WebSocket.Server({ noServer: true });
const scriptPath = './updateRPIsurv.sh';
var streamData;
var streamAddressList = [];



// Websocket
wss.on('connection', (ws) => {
    console.log('Client connected');
	const intervalId = setInterval(async () => {
        try {
            const cpuLoadData = await si.currentLoad();
            const currentLoadPercentage = cpuLoadData.currentLoad;
	    let rpisurvStatus ='unknown';
	    const Mem = await si.mem();
	    const freeRam = Mem.available;
	    const total = Mem.total;
	    const freeRamPerc= freeRam/(total/100);
	    exec("bash ./checkRPIsurvStat.sh", (error, stdout, stderr) => {
		if (error) {
			console.error(`Error checking service status: ${error.message}`);
			return;
		}
		rpisurvStatus = stdout.trim();
           	ws.send(JSON.stringify({ currentLoad: currentLoadPercentage , availableRam: freeRamPerc , servStatus: rpisurvStatus}));
		
	    });
 	
        } catch (error) {
            console.error('Error fetching CPU load information:', error);
        }
    }, 1000);
	
    ws.on('message', (message) => {
        console.log(`Received message: ${message}`);
    });

    ws.on('close', () => {
		clearInterval(intervalId);
        console.log('Client disconnected');
    });
});

logWss.on('connection', (ws) => {
    console.log('Log WebSocket client connected');

    // Create a tail process to stream updates to the log file
    const tailProcess = exec('tail -f /usr/local/bin/rpisurv/logs/main.log');

    tailProcess.stdout.on('data', (data) => {
        // Send log updates to WebSocket clients
        ws.send(data.toString());
    });

    ws.on('close', () => {
        // Close the tail process when WebSocket client disconnects
        console.log('Log WebSocket client disconnected');
        tailProcess.kill();
    });
});

// Middleware to parse the request body
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({ type: 'application/json' })); 
app.use(bodyParser.text({ type: 'application/x-yaml' }));

// Middleware for session management
app.use(session({
    secret: 'SuperKaliFragiListicExpiAliGetisch', // Change this to a random secret key
    resave: false,
    saveUninitialized: true
}));

// Set the 'views' directory for your templates
app.set('views', path.join(__dirname, 'views'));

// Set EJS as the view engine
app.engine('ejs', ejs.renderFile);
app.set('view engine', 'ejs');

app.locals.helpers = helpers;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve static files from the 'node_modules' directory
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

// Middleware to check if the user is authenticated
const authenticateUser = (allowedRoutes) => (req, res, next) => {
    if (req.session && req.session.username) {
	//User is authenticated
	if (!allowedRoutes || allowedRoutes.includes(req.path)) {
            // User is allowed to access this route
            next();
        } else {
            // User is not allowed to access this route
            res.status(403).send('Forbidden');
        }
    } else {
        // User is not authenticated, redirect to login page
        res.redirect('/');
    }
};


// Set up routes
app.get('/', (req, res) => {
    res.render('index', { message: '' });
});

app.post('/login', (req, res) => {
    // Read credentials from the INI file
    const credentialsPath = 'config/credentials.ini';
    const credentials = ini.parse(fs.readFileSync(credentialsPath, 'utf-8'));

    // Check if the provided credentials match
    const username = req.body.username;
    const password = req.body.password;

    if (credentials[username] && credentials[username].password === password) {
        // Store username in the session
        req.session.username = username;
        res.redirect('/dashboard');
    } else {
        // Render the index template with an error message
        res.render('index', { message: 'Invalid credentials. Please try again.' });
    }
});

// Only allow authenticated users for these routes
const allowedRoutes = ['/dashboard', '/streams', '/layout_1', '/layout_2', '/network', '/settings'];

app.get('/dashboard', authenticateUser(allowedRoutes), (req, res) => {
    res.render('dashboard', { username: req.session.username, req: req });
});

app.get('/streams', authenticateUser(allowedRoutes), (req, res) => {
    res.render('streams', { username: req.session.username, req: req  });
});

app.get('/layout_1', authenticateUser(allowedRoutes), (req, res) => {
    res.render('layout_1', { username: req.session.username, req: req  });
});

app.get('/layout_2', authenticateUser(allowedRoutes), (req, res) => {
    res.render('layout_2', { username: req.session.username, req: req  });
});

app.get('/network', authenticateUser(allowedRoutes), (req, res) => {
    res.render('network', { username: req.session.username, req: req  });
});

app.get('/settings', authenticateUser(allowedRoutes), (req, res) => {
    res.render('settings', { username: req.session.username, req: req  });
});

app.get('/preview', (req, res) => {
    res.render('preview');
});

app.get('/logout', (req, res) => {
    // Destroy the session and redirect to the login page
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// Save data to XML file route
app.post('/saveToXml', (req, res) => {
    const data = req.body;
    const filePath = req.get('X-Config-Path');

    if (!Array.isArray(data)) {
        return res.status(400).send('Invalid data format. Expected an array.');
    }

// Create XML structure
const xml = xmlbuilder.create('data');

data.forEach(row => {
    const xmlRow = xml.ele('row');

    Object.entries(row).forEach(([key, value]) => {
        if (value === null || value === undefined) {
            // Skip null or undefined values
            return;
        }

        if (key === 'addVariables' && Array.isArray(value)) {
            // Handle 'addVariables' array
            const xmlAddVariables = xmlRow.ele('addVariables');
            value.forEach(variable => {
                if (variable && typeof variable === 'object') {
                    // Handle each variable in the 'addVariables' array
                    Object.entries(variable).forEach(([variableKey, variableValue]) => {
                        if (variableValue !== null && variableValue !== undefined) {
                            // Skip null or undefined variable values
                            const xmlVariable = xmlAddVariables.ele(variableKey);
                            xmlVariable.text(variableValue);
                        }
                    });
                }
            });
		} else if (Array.isArray(value)) {
            // Handle nested arrays
            const xmlNestedArray = xmlRow.ele(key);
            value.forEach(nestedValue => {
                if (typeof nestedValue === 'object') {
                    // Handle nested objects in the array
                    processRow(xmlNestedArray, nestedValue);
                } else {
                    xmlNestedArray.ele('item', nestedValue);
                }
            });
        } else if (typeof value === 'object') {
            // Handle nested objects
            const xmlNestedObject = xmlRow.ele(key);
            Object.entries(value).forEach(([nestedKey, nestedValue]) => {
                if (nestedValue !== null && nestedValue !== undefined) {
                    // Skip null or undefined values in nested object
                    const xmlNestedElement = xmlNestedObject.ele(nestedKey);
                    xmlNestedElement.text(nestedValue);
                }
            });
        } else {
            // Regular key-value pair
            xmlRow.ele(key, value);
        }
    });
});


    // Convert XML to string
    const xmlString = xml.end({ pretty: true });

    // Write XML to a file
    fs.writeFileSync(filePath, xmlString, 'utf-8');
	loadConfigFiles();
    res.send("save and YAML Parsing Successfull");
	try{
		exec(`bash ${scriptPath}`, (error, stdout, stderr) => {
			if (error) {
				console.error(`Error executing script: ${error}`);
				return;	
			}
		});
	} catch (error) {
        console.error('Error copying and restarting RPIsurv:', error);
    }
});

// Load data from XML file route
app.post('/loadFromXml', (req, res) => {
    const filePath = req.get('X-Config-Path');
    if (!filePath) {
        return res.status(400).send('Missing configuration path in the header.');
    }
    try{
    	const xmlData = fs.readFileSync(filePath, 'utf-8');
    	xml2js.parseString(xmlData, (err, result) => {
        	if (err) {
            	   console.error('Error Parsing XML on Server:', err);
            	   res.status(500).send('Error parsing XML on server.');
        	} else {
	           // Send data to the client
                   res.json({ data: result });
        	}
    	});
    } catch (error) {
	console.error('Error reading the XML File:', error);
        res.status(500).send('Error reading XML file.');
    }
});

// checkstreams route
app.post('/getStreamState', (req, res) => {
	console.log(streamData);
	res.send(streamData);
    const rows = streamData.data.row;
    const status = [];

    // Extract "address_" values and save them to an array
    const addressArray = rows.map(row => row.address_[0]);
    console.log(addressArray);

    for (let i = 0; i < addressArray.length; i++) {
        status[i] = checkUrlAccessibility(addressArray[i]);
    }

    res.send(status);
});

// Load YAML data from file route
app.post('/loadConfiguration', (req, res) => {
    const filePath = req.get('X-Config-Path'); // Read the path from the header

    if (!filePath) {
        return res.status(400).send('Missing configuration path in the header.');
    }

    try {
        const yamlData = fs.readFileSync(filePath, 'utf-8');
        res.send(yamlData);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error reading configuration file.');
    }
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// Attach logWss to the logServer
logServer.on('upgrade', (request, socket, head) => {
    logWss.handleUpgrade(request, socket, head, (ws) => {
        logWss.emit('connection', ws, request);
    });
});

// Listen on a different port for log streaming
const LOG_PORT = 3001;
logServer.listen(LOG_PORT, () => {
    console.log(`Log WebSocket server is running on http://localhost:${LOG_PORT}`);
});

async function loadConfigFiles() {
    try {
        const layoutData = await readAndParseXML('layouts.xml');
        const screensData = await readAndParseXML('screens.xml');
        streamData = await readAndParseXML('streams.xml');
	
	createYAMLFile(layoutData, screensData, streamData);
		
    } catch (error) {
        console.error('error in parsing Configuration Yaml:', error);
		return ("error in parsing Configuration Yaml:",error);
    }
	return ("Yaml Parsing Successfull");
}

const readAndParseXML = (filename) => {
    try {
        const filePath = path.join(__dirname, 'config', filename);
        const xmlData = fs.readFileSync(filePath, 'utf-8');

        return new Promise((resolve, reject) => {
            xml2js.parseString(xmlData, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });
    } catch (error) {
        console.error(`Error reading or parsing ${filename}:`, error);
        throw error;
    }
};

function createYAMLFile(layoutData, screensData, streamData) {
    try {
        const essentials = {
            essentials: {  // Add 'essentials' key at the top level
                screens: []
            }
        };
        const streamAddressList = [];

        streamData.data.row.forEach((streamInfo, index) => {
            streamAddressList.push(streamInfo.address_[0]);
        });

        // Iterate through screensData
        if (Array.isArray(screensData.data.row)) {
            screensData.data.row.forEach(screen => {
                const cameraStreams = [];
                // Iterate through streams in screen
                if (Array.isArray(screen.streams)) {
                    screen.streams.forEach(stream => {
                        stream.item.forEach((item, index) => {
                            const streamInfo = streamData.data.row.find(s => s.name[0] === item);
                            if (streamInfo) {
                                const forceCoordinatesraw = layoutData.layouts.layout
                                    .find(layout => layout.name[0] === screen.layoutName[0]);

                                // Assuming position[index] is an object with properties like "Xmin," "Ymin," etc.
                                const forceCoordinates = Object.keys(forceCoordinatesraw.position[index]).flatMap(key => {
                                    return parseInt(forceCoordinatesraw.position[index][key][0]);
                                });

                                // Convert the array to a string and parse it again
                                const forceCoordinatesString = JSON.stringify(forceCoordinates);

                                let dynamicData = [];

                                if (streamInfo.add) {
                                    if (streamInfo.add.length > 0) {
                                        const keyValueString = streamInfo.add[0];
                                        const [key, value] = keyValueString.split(':');

                                        // Add to dynamicData array
                                        dynamicData.push({ key: key.trim(), value: value.trim() });
                                    }
                                }

                                if (streamInfo.addVariables) {
                                    streamInfo.addVariables.forEach(addVar => {
                                        const objkey = Object.keys(addVar)[0];
                                        const objvalue = addVar[objkey][0];
                                        dynamicData.push({ key: objkey, value: objvalue });
                                    });
                                }

                                const addressWithDQuotes = `"${streamInfo.address_[0]}"`;

                                cameraStreams.push({
                                    url: addressWithDQuotes,
                                    force_coordinates: forceCoordinatesString,
                                    ...(dynamicData.map(entry => ({ [entry.key]: entry.value })).reduce((acc, obj) => ({ ...acc, ...obj }), {})),
                                });

                            } else console.log("againNoStream");
                        });

                    });
                } else console.log("againNoStream");

                // Add screen information to essentials
                essentials.essentials.screens.push({
                    camera_streams: cameraStreams,
                    duration: parseInt(screen.screenTime[0])
                });
            });
        } else {
            console.log("not an array. WTF?");
        }

        // Convert to YAML
        const yamlStringwithQuotes = yaml.dump(essentials, { 'lineWidth': -1 });
        const yamlString = yamlStringwithQuotes.replace(/'/g, '');
        //console.log(yamlString);
        fs.writeFileSync("./config/gendisplay1.yml", yamlString, 'utf-8');
    } catch (error) {
        console.error('Error generating YAML file:', error);
    }
}

async function checkUrlAccessibility(url) {
    try {
        const response = await axios.head(url);

        // Check if the response status is in the 2xx range
        if (response.status >= 200 && response.status < 300) {
            console.log(`URL ${url} is accessible.`);
            return true;
        } else {
            console.log(`URL ${url} is not accessible. Status: ${response.status}`);
            return false;
        }
    } catch (error) {
        console.error(`Error checking URL accessibility for ${url}:`, error.message);
        return false;
    }
}

//---------------------------------------------------------------------------
loadConfigFiles();