This is simple a Domain and SSL Certificate Tracking application to track expirations of both Domains and SSL Certificates and provide notifications before they expire (7,15,and 30 days in advance).  Notifications are done by SMTP and Dashboard.
this has only been tested on Debian 13 lxc 
to install follow these steps:
 1. create a folder on your debian 13 server (example: /etc/simpletrack)
 2. cd into your folder (cd /etc/simpletrack)
 3. chmod +x install.sh
 4. ./install
 5. You should now be able to access the application at http//:ip address of your server:3000
    
<img width="1278" height="751" alt="dashboard" src="https://github.com/user-attachments/assets/055b9ea6-1f78-4067-8545-edc2b6d83ccd" />
<img width="1280" height="750" alt="Domains" src="https://github.com/user-attachments/assets/d64629d7-faac-4229-8d5c-25a2c5399595" />
<img width="1277" height="737" alt="settings" src="https://github.com/user-attachments/assets/9e747a10-12ff-4ee4-b51a-b9ad5825f18a" />
<img width="1286" height="738" alt="SSL" src="https://github.com/user-attachments/assets/676e9dfb-8ffc-4729-8690-e2ada26a97e0" />
