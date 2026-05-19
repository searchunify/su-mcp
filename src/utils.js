const formatRowObject = (obj) =>
  Object.entries(obj)
    .map(
      ([key, value]) =>
        `${key}: ${typeof value === "object" && value !== null ? JSON.stringify(value) : value}`
    )
    .join("\n");

/**
 * Turn analytics / list payloads into plain text for MCP tool responses.
 * Objects with **multiple** top-level arrays (e.g. `total` + `searchSessions`) are rendered
 * per key so nothing is dropped; a single array keeps the legacy row-per-entry layout.
 */
export const formatForClaude = (data) => {
  if (data === null || data === undefined) {
    return {
      content: [{ type: "text", text: "" }],
    };
  }

  if (Array.isArray(data)) {
    const text = data.map((obj) => formatRowObject(obj)).join("\n---\n");
    return {
      content: [{ type: "text", text: `${text}\n---` }],
    };
  }

  if (typeof data === "object") {
    const entries = Object.entries(data);
    const arrayEntries = entries.filter(([, v]) => Array.isArray(v));

    if (arrayEntries.length <= 1) {
      const soleArray = arrayEntries[0]?.[1];
      const arr = soleArray ?? [data];
      const text = arr.map((obj) => formatRowObject(obj)).join("\n---\n");
      return {
        content: [{ type: "text", text: `${text}\n---` }],
      };
    }

    const parts = entries.map(([key, value]) => {
      if (Array.isArray(value)) {
        const rows = value.map((obj) => formatRowObject(obj)).join("\n---\n");
        return `${key}:\n${rows}`;
      }
      return `${key}: ${typeof value === "object" && value !== null ? JSON.stringify(value) : value}`;
    });
    return {
      content: [{ type: "text", text: `${parts.join("\n\n")}\n---` }],
    };
  }

  return {
    content: [{ type: "text", text: String(data) }],
  };
};

export const formatArraysToString = (arr = []) => {
  if (!Array.isArray(arr)) {
    return String(arr).replace(/<\/?[^>]+(>|$)/g, "");
  }
  return arr
    .map((item) => String(item).replace(/<\/?[^>]+(>|$)/g, ""))
    .join(" ");
};
