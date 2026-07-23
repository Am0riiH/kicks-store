const fs = require('fs');
let content = fs.readFileSync('server/index.js', 'utf8');

const regex = /  const b64auth = \(req\.headers\.authorization \|\| ''\)\.split\(' '\)\[1\] \|\| '';[\s\S]*?login === validUsername && password === validPassword\s+\) {/g;

content = content.replace(regex, '');

// Now we need to remove the closing tags that matched this.
// Because the closing tags look like:
//   }
//
//   res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
//   res.status(401).send('Authentication required.');
const closeRegex = /  }\s+res\.set\('WWW-Authenticate', 'Basic realm="Admin Area"'\);\s+res\.status\(401\)\.send\('Authentication required\.'\);/g;

content = content.replace(closeRegex, '');

fs.writeFileSync('server/index.js', content);
console.log('Done!');
