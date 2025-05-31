import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const client = jwksClient({
  jwksUri: `${process.env.AUTH0_ISSUER_BASE_URL}/.well-known/jwks.json`
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

export function verifyToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getKey, {
      audience: process.env.AUTH0_CLIENT_ID,
      issuer: process.env.AUTH0_ISSUER_BASE_URL,
      algorithms: ['RS256']
    }, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    });
  });
}

export async function requireAuth(req, res) {
  const authorization = req.headers.authorization;
  
  if (!authorization) {
    res.status(401).json({ error: 'Authorization header required' });
    return null;
  }

  const token = authorization.replace('Bearer ', '');
  
  try {
    const decoded = await verifyToken(token);
    return decoded;
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
    return null;
  }
} 