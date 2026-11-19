/** Author, links and donation settings shown in the app. Edit here only. */
export const APP_INFO = {
  name: 'telemeSYNC',
  version: __APP_VERSION__,
  author: 'Gabriel Pereira',
  website: 'https://www.pereiragabriel.com/',
  websiteLabel: 'pereiragabriel.com',
  email: 'hello@pereiragabriel.com',
  /** Buy Me a Coffee page, e.g. https://buymeacoffee.com/<utilizador>. Empty = button hidden. */
  donateUrl: 'https://buymeacoffee.com/pereiragabriel',
  year: 2026,
  /**
   * Latest release published by the site; the app shows a notice when it is newer. Tried in order: the old address
   * only answers when telemesync.app can't be reached (versions up to 1.2.0 read only the old one, which keeps
   * serving the same file — see docs/dominio.md). Empty = no check.
   */
  updateUrls: ['https://telemesync.app/data/latest.json', 'https://telemesync.pereiragabriel.com/data/latest.json'],
};
