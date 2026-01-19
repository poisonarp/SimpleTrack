
#!/bin/bash

# SimpleTrack Debian Installer
# This script automates the installation for the programmatic version (No AI required).

set -e

echo "🚀 Starting SimpleTrack Installation..."

# 1. Update and install basic dependencies
echo "📦 Updating system and installing build tools..."
sudo apt-get update
sudo apt-get install -y curl build-essential python3

# 2. Check for Node.js
if ! command -v node &> /dev/null; then
    echo "🟢 Node.js not found. Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "✅ Node.js $(node -v) already installed."
fi

# 3. Install project dependencies
echo "📥 Installing project dependencies..."
npm install

# 4. Build the frontend
echo "🛠️ Building frontend for production..."
npm run build

# 5. Create Environment file (No API Key needed for WHOIS/SSL version)
echo "📝 Creating environment configuration..."
echo "PORT=3000" > .env
echo "NODE_ENV=production" >> .env

# 6. Setup systemd service
echo "⚙️ Configuring systemd service..."
APP_PATH=$(pwd)
USER_NAME=$(whoami)

sudo bash -c "cat > /etc/systemd/system/simpletrack.service <<EOF
[Unit]
Description=SimpleTrack Domain & SSL Tracker
After=network.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$APP_PATH
EnvironmentFile=$APP_PATH/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF"

# 7. Start the service
echo "🔄 Starting SimpleTrack service..."
sudo systemctl daemon-reload
sudo systemctl enable simpletrack
sudo systemctl restart simpletrack

echo ""
echo "✨ Installation Complete!"
echo "🌐 SimpleTrack is now running at: http://localhost:3000"
echo "📊 Dashboard access: Use 'admin' / 'admin' to login."
echo ""
echo "Note: Programmatic WHOIS and SSL checks are active. Ensure your server can reach external WHOIS servers and port 443."
