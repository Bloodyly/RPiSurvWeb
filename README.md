# RPiSurvWeb

this is a Web interface for the RPIsurv software. Its still in early alpha, but setting up streams and layouts with multiple screens works.

to install you can use the install.sh (using sudo bash install.sh)
or you can just :
	-install nodeJS version 20.x
	-copy the rpisurvweb folder to /var/www and the rpisurvweb.service to /etc/systemd/system 
	-and then enable it with "sudo systemctl enable rpisurvweb.service"

the webinterface is using nodeJS and runs on port 3000 and 3001, so it should not interfere with other webservers you may have running.