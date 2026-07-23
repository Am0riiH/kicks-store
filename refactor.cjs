const fs = require('fs');

let content = fs.readFileSync('server/index.js', 'utf8');

const authCodeRegex = /  const b64auth = \(req\.headers\.authorization \|\| ''\)\.split\(' '\)\[1\] \|\| '';\s+const \[login, password\] = Buffer\.from\(b64auth, 'base64'\)\.toString\(\)\.split\(':'\);\s+const validUsername = process\.env\.ADMIN_USERNAME;\s+const validPassword = process\.env\.ADMIN_PASSWORD;\s+if \(\s+validUsername && validPassword &&\s+login === validUsername && password === validPassword\s+\) {([\s\S]*?)  }\s+res\.set\('WWW-Authenticate', 'Basic realm="Admin Area"'\);\s+res\.status\(401\)\.send\('Authentication required\.'\);/g;

content = content.replace(authCodeRegex, (match, innerCode) => {
  return innerCode; // We just keep the inner logic because the middleware handles the rest!
});

// Now insert the middleware setup
const rateLimitCode = `
const rateLimit = require('express-rate-limit');

// 1. General API Limiter (100 per 15 min)
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});

// 2. Checkout Limiter (10 per 15 min)
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many checkout attempts, please try again later.' }
});

// 3. Admin Login Limiter (5 failed attempts per 15 min)
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true, // Only count failed logins (401s)
  message: { error: 'Too many failed login attempts, please try again later.' }
});

// Admin Auth Middleware
function adminAuth(req, res, next) {
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

  const validUsername = process.env.ADMIN_USERNAME;
  const validPassword = process.env.ADMIN_PASSWORD;

  if (
    validUsername && validPassword &&
    login === validUsername && password === validPassword
  ) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
  res.status(401).send('Authentication required.');
}

// Apply general API limiter to all API routes
app.use('/api/', generalApiLimiter);

// Apply admin auth and rate limiter to all admin routes
app.use('/api/admin/', adminLoginLimiter, adminAuth);
`;

content = content.replace('app.use(express.json());', 'app.use(express.json());\n' + rateLimitCode);

// Apply checkout limiter to checkout route
content = content.replace("app.post('/api/create-checkout-session',", "app.post('/api/create-checkout-session', checkoutLimiter,");

fs.writeFileSync('server/index.js', content);
console.log('Refactored server/index.js successfully!');
