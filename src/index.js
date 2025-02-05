/**
 * Check whether this page is being loaded during the extension startup, in an
 * attempt to ensure the service worker is installed.
 *
 * @returns Whether this appears to be an extension startup page load.
 */
function isExtensionStartup() {
  const { hash } = window.location;
  return hash === '#extensionStartup';
}

window.addEventListener('load', async () => {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./service-worker.js');
      console.log('Service worker registered!');
    } catch (error) {
      console.warn('Error registering service worker:');
      console.warn(error);
    }
  }
});

// Skip stream initialization on extension startup (when this page is loaded
// in a hidden iframe), and in sub-frames. In both cases, the user interactions
// handled by the streams are not possible.
if (!isExtensionStartup()) {
  if (window.top === window.self) {
    window.document.addEventListener('DOMContentLoaded', start);
  } else {
    // The sub-frame case requires the "open in new tab" href to be set
    // dynamically because a relative `href` attribute would not preserve
    // the URL hash.
    window.document.addEventListener(
      'DOMContentLoaded',
      setupOpenSelfInNewTabLink,
    );
  }
}

/**
 * Setup the "Open in new tab" link.
 *
 * This is necessary so that the "open in new tab" link includes the current
 * URL hash. A statically-set relative `href` would drop the URL hash.
 */
function setupOpenSelfInNewTabLink() {
  const newTabLink = window.document.getElementById('open-self-in-new-tab');
  if (!newTabLink) {
    throw new Error('Unable to locate "Open in new tab" link');
  }
  newTabLink.setAttribute('href', window.location.href);
}

/**
 * Checks to see if the suspectHref is a valid format to forward on
 * Specifically checks the protocol of the passed href.
 *
 * @param href - The href value to check.
 * @returns Boolean on if its valid to attack to a href prop.
 */
function isValidSuspectHref(href) {
  /* eslint-disable-next-line */
    const disallowedProtocols = ['javascript:'];
  const parsedSuspectHref = new URL(href);

  return disallowedProtocols.indexOf(parsedSuspectHref.protocol) < 0;
}

/**
 * Initialize the phishing warning page streams.
 */
function start() {
  const { hash } = new URL(window.location.href);
  const hashContents = hash.slice(1); // drop leading '#' from hash
  const hashQueryString = new URLSearchParams(hashContents);
  const suspectHostname = hashQueryString.get('hostname');
  const suspectHref = hashQueryString.get('href');

  if (!suspectHostname) {
    throw new Error("Missing 'hostname' query parameter");
  } else if (!suspectHref) {
    throw new Error("Missing 'href' query parameter");
  }

  const newIssueLink = document.getElementById('new-issue-link');
  if (!newIssueLink) {
    throw new Error('Unable to locate new issue link');
  }

  const newIssueUrl =
    hashQueryString.get('newIssueUrl') ||
    `https://github.com/scamsniffer/eth-phishing-detect/issues/new`;
  const newIssueParams = `?title=[Legitimate%20Site%20Blocked]%20${encodeURIComponent(
    suspectHostname,
  )}&body=${encodeURIComponent(suspectHref)}`;
  newIssueLink.setAttribute('href', `${newIssueUrl}${newIssueParams}`);

  const continueLink = document.getElementById('unsafe-continue');
  if (!continueLink) {
    throw new Error('Unable to locate unsafe continue link');
  }

  if (isValidSuspectHref(suspectHref) === false) {
    const redirectWarningMessage = document.getElementById(
      'redirect-warning-message',
    );
    if (redirectWarningMessage) {
      redirectWarningMessage.innerHTML = `<br />`;
      redirectWarningMessage.innerText = `This URL does not use a supported protocol so we won't give you the option to skip this warning.`;
    }
  }

  continueLink.addEventListener('click', async () => {
    if (isValidSuspectHref(suspectHref) === false) {
      console.log(`Disallowed Protocol, cannot continue.`);
      return;
    }

    window.postMessage(
      {
        target: 'scamsniffer-contentscript',
        data: {
          method: 'safelistPhishingDomain',
          param: suspectHostname,
        },
      },
      location.origin,
    );

    window.location.href = suspectHref;
  });
}
