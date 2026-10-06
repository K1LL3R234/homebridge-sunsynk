// Thin wrapper around the Homebridge logger. Homebridge already adds the
// timestamp and the platform name, and it routes output through its own log
// handling (the UI log viewer, log files, colours), so every level goes there
// rather than to console.log.
//
// debug() follows the plugin's own "Enable Debug Logging" option rather than
// Homebridge's -D flag, so it prints at info level with a [DEBUG] tag.
class LogUtil {
    constructor(isDebug = false, prefix = '', log) {
        this.hbLog = log;
        this.isDebug = isDebug;
        // Kept for compatibility; Homebridge's logger already carries the prefix.
        this.prefix = prefix;
    }

    log(...args) {
        this.hbLog.info(...args);
    }

    debug(...args) {
        if (this.isDebug) {
            this.hbLog.info('[DEBUG]', ...args);
        }
    }

    warn(...args) {
        this.hbLog.warn(...args);
    }

    // Errors always print. They used to be hidden unless debug logging was on.
    error(...args) {
        this.hbLog.error(...args);
    }
}

module.exports = LogUtil;
