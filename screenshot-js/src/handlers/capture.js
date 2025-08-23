/**
 * Screenshot capture handler
 */

/**
 * Handle screenshot capture requests
 * @param {object} screenshotter - Screenshotter instance
 * @param {object} args - Capture arguments
 * @returns {Promise<object>} Capture result
 */
export async function handleCapture(screenshotter, args = {}) {
  try {
    const {
      monitor = 0,
      format = 'png',
      quality = 90,
      saveToFile = true,
      filename = null,
      area = null
    } = args;

    // Validate arguments
    if (typeof monitor !== 'number' || monitor < 0) {
      throw new Error('Monitor must be a non-negative number');
    }

    if (!['png', 'jpeg', 'jpg'].includes(format)) {
      throw new Error('Format must be png, jpeg, or jpg');
    }

    if (typeof quality !== 'number' || quality < 1 || quality > 100) {
      throw new Error('Quality must be a number between 1 and 100');
    }

    if (area) {
      const { x, y, width, height } = area;
      if (typeof x !== 'number' || typeof y !== 'number' || 
          typeof width !== 'number' || typeof height !== 'number') {
        throw new Error('Area coordinates must be numbers');
      }
      if (width <= 0 || height <= 0) {
        throw new Error('Area width and height must be positive');
      }
    }

    // Capture screenshot
    const result = await screenshotter.capture({
      monitor,
      format,
      quality,
      saveToFile,
      filename,
      area
    });

    // Format response
    const response = {
      success: true,
      operation: 'capture',
      screenshot: {
        filename: result.filename || null,
        filepath: result.filepath || null,
        format: result.format,
        width: result.width,
        height: result.height,
        size: result.size,
        sizeFormatted: result.sizeFormatted,
        monitor,
        timestamp: result.timestamp,
        executionTime: result.executionTime
      },
      // Include base64 data for immediate use
      base64: result.base64
    };

    // Don't include base64 in the main response text to keep it clean
    const responseText = {
      success: true,
      operation: 'capture',
      screenshot: response.screenshot,
      message: `Screenshot captured successfully${saveToFile ? ` and saved as ${result.filename}` : ''}`
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(responseText, null, 2),
        },
      ],
      // Provide base64 as additional metadata for Claude to use
      _meta: {
        base64: result.base64,
        contentType: `image/${result.format}`
      }
    };

  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            operation: 'capture',
            error: error.message,
            timestamp: new Date().toISOString()
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}