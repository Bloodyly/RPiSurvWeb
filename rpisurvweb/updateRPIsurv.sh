#!/bin/bash

config_dir="./config"
dest_dir="/usr/local/bin/rpisurv/conf"

# List of files to copy
files=("gendisplay1.yml" "gendisplay2.yml" "genconf.yml")
destfiles=("display1.yml" "display2.yml" "conf.yml")
sleep 2
# Loop through the files and copy them if they exist
for ((i=0; i<${#files[@]}; i++)); do
    source_path="${config_dir}/${files[i]}"
    dest_path="${dest_dir}/${destfiles[i]}"

    # Check if the source file exists
    if [ -e "$source_path" ]; then
        # Copy the file to the destination (overwrite if exists)
        cp -f "$source_path" "$dest_path"
        echo "Copied ${files[i]} to $dest_path"
    else
        echo "Source file ${files[i]} does not exist. Skipping..."
    fi
done
sleep 1
# Restart the rpisurv service
systemctl restart rpisurv
