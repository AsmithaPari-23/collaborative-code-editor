import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import logger from '../utils/logger.js';

export const protect = async (req, res, next) => {
  let token = req.cookies?.token;

  // Fallback to Bearer token in Authorization header
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    res.status(401);
    return next(new Error('Not authorized: No token provided'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find the user and exclude password field
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      res.status(401);
      return next(new Error('Not authorized: User no longer exists'));
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401);
    return next(error);
  }
};
