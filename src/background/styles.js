import * as postcss from 'postcss';

import BrowserAction from './browseraction';
import { matchesPattern, isValidHTML } from './utils';

/**
 * Styles object used by background.js
 * @constructor
 * @param {Object} param JSON style object
 * Example:
 * styles = {
    'google.com' : {.
      _rules: {
        'a': {
          'color': 'red'
        }
      },
      _enabled: true
    }
  }
 */
function Styles(stylesObj) {
  this.styles = stylesObj;

  this.AT_RULE_PREFIX = 'at';
  this.RULES_PROPERTY = 'css';
  this.ENABLED_PROPERTY = '_enabled';
}

/**
 * Delete a style.
 * @param {String} url The url of the style to delete.
 */
Styles.prototype.delete = function(url) {
  delete this.styles[url];
  this.persist();
};

/**
 * Return the style object associated with the given url.
 *   If no url is given, return all the style objects.
 * @param {String} url The URL of the requested object.
 * @return {Object} The request style(s) object(s).
 */
Styles.prototype.get = function(url) {
  if (url === undefined) {
    return this.styles;
  } else {
    return this.styles[url];
  }
};

Styles.prototype.set = function(url, value) {
  if (url === undefined) {
    return false;
  } else {
    this.styles[url] = value;
    return this.styles[url];
  }
};

Styles.prototype.persist = function() {
  chrome.storage.local.set({
    styles: this.styles,
  });
};

/**
 * Create a new style for the specified URL
 * @param {String} url URL of the new object.
 * @param {Object} rules Rules for the given URL.
 */
Styles.prototype.create = function(url, css) {
  this.styles[url] = {};
  this.styles[url].css = css;
  this.styles[url].enabled = true;

  this.persist();
};

/**
 * Retrieve the enabled status for the given URL.
 * @param {String} url URL of the requested object.
 * @return {Boolean} The enabled status for the given URL.
 */
Styles.prototype.isEnabled = function(url) {
  if (this.styles[url] === undefined) {
    return false;
  }
  return this.styles[url].enabled;
};

/**
 * Save the given rules and metadata inside the style for the given URL.
 *   If no rules are given, delete the given URL's style.
 * @param {String} url URL of the saved object.
 * @param {Object} rules rules New rules for the given URL.
 * @param {Object} data New metadata for the given URL.
 */
Styles.prototype.save = function(url, rules, data) {
  if (!url || url === '') {
    return;
  }

  if (rules) {
    this.create(url, rules, data);
  } else {
    this.delete(url);
  }
};

/**
 * If no value is given, toggle the enabled status for the given URL.
 *   Otherwise, set the enabled status for the given URL.
 * @param {String} url URL of the saved object.
 * @param {Object} value The enabled status for the given URL.
 */
Styles.prototype.toggle = function(url, value, shouldSave) {
  if (this.isEmpty(url)) {
    return false;
  }

  if (value != undefined && value != null) {
    this.styles[url][this.ENABLED_PROPERTY] = value;
  } else {
    this.styles[url][this.ENABLED_PROPERTY] = !this.styles[url][
      this.ENABLED_PROPERTY
    ];
  }

  if (shouldSave) {
    this.persist();
  }

  return true;
};

/**
 * If no value is given, toggle the enabled status for all the styles.
 *   Otherwise, set the enabled status for all the styles.
 * @param {Object} value The enabled status.
 */
Styles.prototype.toggleAll = function(value) {
  for (var url in this.styles) {
    this.toggle(url, value, false);
  }
  this.persist();
};

Styles.prototype.deleteAll = function() {
  this.styles = {};
  this.persist();
};

/**
 * Check if the style for the given URL exists.
 * @param {String} url The style's URL.
 * @return {Boolean} True if the requested style exists.
 */
Styles.prototype.isEmpty = function(url) {
  if (!this.styles[url]) {
    return true;
  }

  const rules = this.getRules(url);
  if (!rules || Object.keys(rules).length === 0) {
    return true;
  }

  return false;
};

/**
 * Empty the rules for a style
 * @param {String} url Identifier of the style to empty.
 */
Styles.prototype.emptyRules = function(url) {
  this.styles[url][this.RULES_PROPERTY] = null;
  this.persist();
};

/**
 * Import a styles object i.e. replace the existing styles
 *   object with the specified object
 * @param {Object} newStyles Styles object to import.
 */
Styles.prototype.import = function(newStyles) {
  for (var url in newStyles) {
    if (newStyles[url][this.RULES_PROPERTY]) {
      // it's the new format.
      this.styles[url] = newStyles[url];
    } else {
      // legacy support for the old format.
      this.create(url, newStyles[url]);
    }
  }

  this.persist();
};

/**
 * Retrieve style rules for the specified url.
 * @param {String} url The url for which to return the rules.
 * @return {Object} The style rules for the URL, if it exists. Else, null.
 */
Styles.prototype.getCss = function(url) {
  if (!this.styles[url]) {
    return '';
  }

  return this.styles[url].css;
};

/**
 * Check if a style exists for the URL.
 * @param {String} aURL The URL to check.
 * @return {Boolean} True if any rules are associated with the URL
 */
Styles.prototype.exists = function(aURL) {
  return this.isEnabled(aURL);
};

Styles.prototype.getStyleUrlMetadataForTab = function(tab) {
  if (!isValidHTML(tab.url)) {
    return null;
  }

  const styleUrlMetadata = [];
  for (const styleUrl in this.styles) {
    if (matchesPattern(tab.url, styleUrl) && !this.isEmpty(styleUrl)) {
      styleUrlMetadata.push({
        url: styleUrl,
        enabled: this.isEnabled(styleUrl),
      });
    }
  }

  return styleUrlMetadata;
};

/**
 * Retrieve merged CSS rules to be applied to the current tab
 */
Styles.prototype.getComputedStylesForTab = function(tabUrl, tab) {
  if (!isValidHTML(tabUrl)) {
    return { url: '', css: '' };
  }

  let url = '';
  let css = '';

  for (const styleUrl in this.styles) {
    if (!this.isEnabled(styleUrl)) {
      continue;
    }

    if (matchesPattern(tabUrl, styleUrl)) {
      if (styleUrl.length > url.length) {
        url = styleUrl;
      }

      css = this.mergeCss(this.getCss(styleUrl), css, styleUrl === url);
    }
  }

  window.cache.loadingTabs[tab.id] = { url, css };
  BrowserAction.update(tab);

  return { url, css };
};

Styles.prototype.getComputedStylesForIframe = function(url, tab) {
  const response = window.cache.loadingTabs[tab.id];
  return response ? response : this.getComputedStylesForTab(url, tab);
};

Styles.prototype.getEditableStyleUrlForTab = function(defaultUrl, tab) {
  if (!isValidHTML(tab.url)) {
    return { url: '', rules: {} };
  }

  let url = '';
  let rules = {};

  for (const styleUrl in this.styles) {
    if (matchesPattern(tab.url, styleUrl)) {
      if (
        (this.isEnabled(styleUrl) && styleUrl.length > url.length) ||
        defaultUrl === styleUrl
      ) {
        url = styleUrl;
      }

      rules = this.getRules(styleUrl);
    }
  }

  if (url && !this.isEnabled(url)) {
    this.toggle(url, true, true);
  }

  window.cache.loadingTabs[tab.id] = { url, rules };
  BrowserAction.update(tab);

  return { url, rules };
};

/**
 * Transfer rules from source URL to destination URL.
 * @param {String} source Source's identifier.
 * @param {String} destination Destination's identifier.
 */
Styles.prototype.transfer = function(source, destination) {
  if (this.styles[source]) {
    this.styles[destination] = this.styles[source];
    this.persist();
  }
};

/**
 * Merge css into existing css while managing conflicts
 * @param {string} src css that should be copied
 * @param {string} dest css to merge into
 * @param {Boolean} isPrimaryURL If the url for src takes priority over dest
 *   url for the page. Used to manage conflicts.
 */
Styles.prototype.mergeCss = function(src, dest, isPrimaryURL) {
  const root1 = postcss.parse(src);
  const root2 = postcss.parse(dest);
  root1.append(root2);

  root1.walkDecls(decl => {
    decl.important = true;
  });

  return root1.toString();
};

Styles.prototype.expandRules = function(rules) {
  for (const selector in rules) {
    rules[selector] = this.expandRule(selector, rules[selector]);
  }

  return rules;
};

/**
 * Expand rule to include any additional properties. Currently
 * expands only @import rule.
 * @param {String} selector The CSS selector for the rule.
 * @param {Object} rule The Rule to expand
 * @param {Function} callback The callback method that is passed the expanded
 *   rule.
 */
Styles.prototype.expandRule = function(selector, rule) {
  if (this.isImportRuleSelector(selector)) {
    var expandedRule = this.expandImportRule(rule);
    if (expandedRule) {
      rule = expandedRule;
    }
  }

  return rule;
};

/**
 * Check if the selector corresponds to an @import rule. The selector
 * is of the form "at-N" for @import rules (where N is the line number)
 * @param {String} selector The CSS selector for the rule
 * @return {Boolean} True if the selector corresponds to an @import rule
 */
Styles.prototype.isImportRuleSelector = function(selector) {
  return selector.indexOf(this.AT_RULE_PREFIX) == 0;
};

/**
 * Expand @import rule to include the CSS fetched from the URL
 *   and send a push request to specified tab to update the rule.
 * @param {Object} rule The @import rule to expand
 */
Styles.prototype.expandImportRule = function(rule) {
  var css = window.cache.importRules[rule['url']];

  if (css) {
    rule['expanded_text'] = css;
    return rule;
  }

  this.fetchImportCSS(rule['url'], function(css) {
    rule['expanded_text'] = css;
  });
};

/**
 * Fetch css for an @import rule
 * @param {String} url URL for the @import rule
 * @param {Function} callback This method is passed the css for the @import rule
 */
Styles.prototype.fetchImportCSS = function(url, callback) {
  if (window.cache.importRules[url]) {
    callback(window.cache.importRules[url]);
  } else {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState == 4) {
        window.cache.importRules[url] = xhr.responseText;
        callback(xhr.responseText);
      }
    };

    xhr.send();
  }
};

Styles.prototype.updateStylesForTab = function(tab) {
  const response = this.getComputedStylesForTab(tab.url, tab);

  chrome.tabs.sendRequest(tab.id, {
    name: 'updateStyles',
    url: response.url,
    rules: response.rules,
  });
};

export default Styles;
