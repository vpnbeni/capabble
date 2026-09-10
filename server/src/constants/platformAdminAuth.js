/** Email or Capabble-style username (e.g. admin.capabble). */
const PLATFORM_ADMIN_LOGIN_REGEX =
  /^(?:[^\s@]+@[^\s@]+\.[^\s@]+|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/i;

const PLATFORM_ADMIN_LOGIN_MESSAGE = 'Please provide a valid email address or username';

const DEFAULT_PLATFORM_ADMIN_LOGIN = 'admin.capabble';

module.exports = {
  PLATFORM_ADMIN_LOGIN_REGEX,
  PLATFORM_ADMIN_LOGIN_MESSAGE,
  DEFAULT_PLATFORM_ADMIN_LOGIN,
};
