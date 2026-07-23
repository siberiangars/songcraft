const { spawn } = require('child_process');
const path = require('path');

const server = spawn('npx', ['next', 'start', '-p', '3000'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true
});

server.on('error', (err) => {
  console.error('Failed to start server:', err);
});

console.log('Server starting...');
