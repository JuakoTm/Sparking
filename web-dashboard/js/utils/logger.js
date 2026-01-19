// js/utils/logger.js
import { CONFIG } from '../config/config.js';

function safeConsole(method, ...args) {
  try {
    if (console && typeof console[method] === 'function') {
      console[method](...args);
    }
  } catch (e) {
    // ignore
  }
}

export const logger = {
  debug: (...args) => {
    if (CONFIG && CONFIG.DEBUG) safeConsole('debug', ...args);
  },
  info: (...args) => {
    if (CONFIG && CONFIG.DEBUG) safeConsole('log', ...args);
  },
  warn: (...args) => safeConsole('warn', ...args),
  error: (...args) => safeConsole('error', ...args),
};

export default logger;
