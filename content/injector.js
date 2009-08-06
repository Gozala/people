/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is People.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Myk Melez <myk@mozilla.org>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

/* Inject the people API into window.navigator objects. */
/* Based on code in the Geode extension. */

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://people/modules/ext/URI.js");

let PeopleInjector = {
  get _docSvc() {
    delete this._docSvc;
    return this._docSvc = Cc["@mozilla.org/docloaderservice;1"].
                          getService(Ci.nsIWebProgress);
  },

  onLoad: function() {
    // WebProgressListener for getting notification of new doc loads.
    // XXX Ugh. Since we're a chrome overlay, it would be nice to just
    // use gBrowser.addProgressListener(). But that isn't sending
    // STATE_TRANSFERRING, and the earliest we can get at the page is
    // STATE_STOP (which is onload, and is inconveniently late).
    // We'll use the doc loader service instead, but that means we need to
    // filter out loads for other windows.
    this._docSvc.addProgressListener(this,
                                     Ci.nsIWebProgress.NOTIFY_STATE_DOCUMENT);
  },

  onUnload: function() {
    this._docSvc.removeProgressListener(this);
  },


  //**************************************************************************//
  // nsISupports

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIWebProgressListener,
                                         Ci.nsIEventHandler,
                                         Ci.nsISupportsWeakReference]),


  //**************************************************************************//
  // nsIWebProgressListener

  onStateChange: function(aWebProgress, aRequest, aStateFlags,  aStatus) {
    // STATE_START is too early, doc is still the old page.
    // STATE_STOP is inconveniently late (it's onload).
    if (!(aStateFlags & Ci.nsIWebProgressListener.STATE_TRANSFERRING))
      return;

    var domWindow = aWebProgress.DOMWindow;
    var chromeWin = domWindow
                        .QueryInterface(Ci.nsIInterfaceRequestor)
                        .getInterface(Ci.nsIWebNavigation)
                        .QueryInterface(Ci.nsIDocShellTreeItem)
                        .rootTreeItem
                        .QueryInterface(Ci.nsIInterfaceRequestor)
                        .getInterface(Ci.nsIDOMWindow)
                        .QueryInterface(Ci.nsIDOMChromeWindow);
    if (chromeWin != window)
      return;

    this._inject(domWindow);
  },

  // Stubs for the nsIWebProgressListener interfaces that we don't use.
  onProgressChange: function() {},
  onLocationChange: function() {},
  onStatusChange:   function() {},
  onSecurityChange: function() {},


  //**************************************************************************//
  // nsIEventHandler

  handleEvent: function(event) {
    alert(event.type);
  },

  get _scriptToInject() {
    delete this._scriptToInject;

    let uri = new URI("resource://people/content/injected.js").
              QueryInterface(Ci.nsIFileURL);

    // Slurp the contents of the file into a string.
    let inputStream = Cc["@mozilla.org/network/file-input-stream;1"].
                      createInstance(Ci.nsIFileInputStream);
    inputStream.init(uri.file, 0x01, -1, null); // RD_ONLY
    let lineStream = inputStream.QueryInterface(Ci.nsILineInputStream);
    let line = { value: "" }, hasMore, scriptToInject = "";
    do {
        hasMore = lineStream.readLine(line);
        scriptToInject += line.value + "\n";
    } while (hasMore);
    lineStream.close();

    return this._scriptToInject = scriptToInject;
  },

  /*
   * _inject
   *
   * Injects window.navigator.people into the specified DOM window.
   */
  _inject: function(aWindow) {
    let sandbox = new Cu.Sandbox(aWindow);
    sandbox.__proto__ = aWindow.wrappedJSObject;
    Cu.evalInSandbox(this._scriptToInject, sandbox, "1.7");

    aWindow.addEventListener("moz-people-find", this, false, true);
  }

};

window.addEventListener("load",   function() PeopleInjector.onLoad(),   false);
window.addEventListener("unload", function() PeopleInjector.onUnload(), false);
