#!/bin/bash

echo "This will install RPIsurvWeb!"
echo "It's in an early alpha state and not feature complete!"
echo "At the moment, only setting up Streams and Layout works, and only for display 1."
echo "The server runs on port 3000, so access the interface, for example, with 192.168.0.100:3000."
echo "The default credentials are user1 and password1. They are read from the credentials.ini in the config folder. You should change these!"
echo "Also, don't expect this to be safe; it shouldn't be used in a production environment."
echo "--------------------------------------------------------------------------------"

sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg

curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/nodesource.gpg
NODE_MAJOR=20
echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list

sudo apt update
sudo apt install -y nodejs build-essential

sudo chmod +x ./rpisurvweb/server.js
sudo chmod +x ./rpisurvweb/checkRPIsurvStat.sh
sudo chmod +x ./rpisurvweb/updateRPIsurv.sh

web_directory="/var/www"

# Check if the directory exists, create it if not
if [ ! -d "$web_directory" ]; then
  sudo mkdir -p "$web_directory"
fi

sudo mv rpisurvweb "$web_directory"
sudo mv rpisurvweb.service /etc/systemd/system/
sudo systemctl enable rpisurvweb
sudo systemctl start rpisurvweb

current_ip_address=$(hostname -I | awk '{print $1}')
echo "You can now access the configuration from http://$current_ip_address:3000"