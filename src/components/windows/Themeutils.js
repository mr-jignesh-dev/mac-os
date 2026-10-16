/** Reads the currently-active --cli-accent off a DOM node (CSS custom
 *  properties inherit down the tree, so this picks up whichever theme
 *  class — default/dracula/monokai/matrix — is on the ancestor .cli-window
 *  right now). Falls back to the default theme's teal if unavailable. */
export const getAccentColor = (node, fallback = "#34d399") => {
  if (!node || typeof getComputedStyle === "undefined") return fallback;
  const val = getComputedStyle(node).getPropertyValue("--cli-accent").trim();
  return val || fallback;
};