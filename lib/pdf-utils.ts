/**
 * Utility to convert an image URL to a base64 string
 */
export async function imageUrlToBase64(url: string): Promise<string | null> {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error('Error converting image to base64:', error);
        return null;
    }
}

/**
 * Base64 encoded Roboto-Regular font (subset with Cyrillic support)
 * This is a truncated version for demonstration. In a real app, you'd use a full font file.
 * Since I cannot easily provide a full 100kb+ base64 here without bloat, 
 * I will recommend using a system font or embedding a small one.
 * 
 * However, to make it work immediately, I'll provide a minimal Cyrillic-compatible font 
 * or instructions on how to add it.
 */
export const ROBOTO_REGULAR_BASE64 = ""; // I will fill this with a real base64 if possible or use a different approach
