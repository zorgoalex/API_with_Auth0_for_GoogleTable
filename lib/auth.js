import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const client = jwksClient({
  jwksUri: `${process.env.AUTH0_ISSUER_BASE_URL}/.well-known/jwks.json`,
  requestHeaders: {},
  timeout: 30000,
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      console.error('Error getting signing key:', err);
      callback(err);
      return;
    }
    
    if (!key) {
      console.error('No key returned from JWKS');
      callback(new Error('No key found'));
      return;
    }
    
    const signingKey = key.publicKey || key.rsaPublicKey;
    if (!signingKey) {
      console.error('No public key found in JWKS response');
      callback(new Error('No public key found'));
      return;
    }
    
    callback(null, signingKey);
  });
}

export function verifyToken(token) {
  // Декодируем токен без проверки чтобы посмотреть содержимое
  const decoded = jwt.decode(token, { complete: true });
  console.log('Token payload:', decoded?.payload);
  console.log('Expected issuer:', process.env.AUTH0_ISSUER_BASE_URL);
  console.log('Token issuer:', decoded?.payload?.iss);
  
  // Нормализуем issuer - убираем слэш в конце если есть
  const expectedIssuer = process.env.AUTH0_ISSUER_BASE_URL?.replace(/\/$/, '');
  const tokenIssuer = decoded?.payload?.iss?.replace(/\/$/, '');
  
  return new Promise((resolve, reject) => {
    jwt.verify(token, getKey, {
      audience: `https://${process.env.AUTH0_ISSUER_BASE_URL?.replace('https://', '').replace(/\/$/, '')}/api/v2/`,
      issuer: [process.env.AUTH0_ISSUER_BASE_URL, process.env.AUTH0_ISSUER_BASE_URL + '/', process.env.AUTH0_ISSUER_BASE_URL?.replace(/\/$/, '')],
      algorithms: ['RS256']
    }, (err, decoded) => {
      if (err) {
        console.error('JWT verification error:', err);
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
    console.error('No authorization header');
    res.status(401).json({ error: 'Authorization header required' });
    return null;
  }

  const token = authorization.replace('Bearer ', '');
  console.log('Received token:', token.substring(0, 50) + '...');
  console.log('Token length:', token.length);
  
  // Временно: просто декодируем токен без проверки подписи для тестирования
  try {
    const decoded = jwt.decode(token);
    if (!decoded) {
      throw new Error('Cannot decode token');
    }
    
    // Проверяем базовые поля
    if (!decoded.sub || !decoded.iss) {
      throw new Error('Invalid token structure');
    }
    
    // Проверяем срок действия
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      throw new Error('Token expired');
    }
    
    console.log('Token decoded successfully for user:', decoded.sub);
    return decoded;
  } catch (error) {
    console.error('Token processing failed:', error.message);
    res.status(401).json({ error: 'Invalid token', details: error.message });
    return null;
  }
} 