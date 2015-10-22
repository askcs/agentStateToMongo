How to

- Copy agent files to eve-agents directory
- Copty scheduler files to eve-scheduler directory
- Remove node_modules (if it still exists
- Run npm install in the directory
- If node-gyp fails, install a recent Python version (if any), and install node-gyp 2012 global:
	npm install -g node-gyp -msvs_version=2012
	
Conversion:

- Start the local MongoDB. E.g:
	- cd C:\MongoDB\bin
	- .\mongod.exe --dbpath ../data
- Run: node ./convert.js
- Use some tool to check if the conversion worked (e.g. Robomongo on Windows; connect to localhost:27017, default no password)