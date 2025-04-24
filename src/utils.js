export const formatForClaude = (dataArray) => {
  const text = dataArray.map(obj => {
    return Object.entries(obj)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
  }).join('\n---\n');

  return {
    content: [
      {
        type: "text",
        text: text + '\n---' // Add trailing separator if needed
      }
    ]
  };
};

export const formatArraysToString = (arr = []) => {
  if (!Array.isArray(arr)) {
    return String(arr).replace(/<\/?[^>]+(>|$)/g, ""); // Ensure it's a string and remove HTML tags
  }
  return arr
    .map(item => String(item).replace(/<\/?[^>]+(>|$)/g, "")) // Convert each element to string and remove HTML tags
    .join(' ');
};

