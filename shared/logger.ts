type LogFn = (...args: unknown[]) => void;

interface Logger {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
}

const PREFIX = '[VidGrab]';

const noop: LogFn = () => {};

export const log: Logger = {
  // debug disabled in production builds
  debug: import.meta.env.PROD
    ? noop
    : (...args) => console.debug(PREFIX, ...args),
  info: (...args) => console.info(PREFIX, ...args),
  warn: (...args) => console.warn(PREFIX, ...args),
  error: (...args) => console.error(PREFIX, ...args),
};
