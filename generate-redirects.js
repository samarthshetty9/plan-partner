import fs from 'fs';
const backendUrl = (process.env.BACKEND_URL || "http://13.233.110.45:3001").replace(/\/$/, "");
const redirects = `
/api/*  ${backendUrl}/api/:splat  200!
/*  /index.html  200
`;
fs.writeFileSync('public/_redirects', redirects.trim());
console.log("Generated public/_redirects with BACKEND_URL:", backendUrl);
