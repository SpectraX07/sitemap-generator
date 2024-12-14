const generateBtn = document.getElementById('generate');
const urlInput = document.getElementById('url');
const output = document.getElementById('output');
const copyBtn = document.getElementById('copyBtn');

generateBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) {
        alert('Please enter a valid URL.');
        return;
    }

    output.textContent = '';
    output.classList.remove('fade-in');
    generateBtn.disabled = true;
    copyBtn.disabled = true;
    generateBtn.innerHTML = '<span class="spinner"></span>Generating...';

    try {
        const response = await fetch(`/api/generate-sitemap?url=${encodeURIComponent(url)}`);
        if (!response.ok) {
            throw new Error('Error generating sitemap');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        const outputContainer = document.querySelector('.output-content'); // Added reference

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const decodedText = decoder.decode(value, { stream: true });
            output.textContent += decodedText;
            Prism.highlightElement(output);

            // Scroll automatically to the bottom
            outputContainer.scrollTop = outputContainer.scrollHeight;
        }

        output.classList.add('fade-in');
        copyBtn.disabled = false;
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
    } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate Sitemap';
    }
});

copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(output.textContent)
        .then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyBtn.textContent = 'Copy to Clipboard';
            }, 2000);
        })
        .catch(err => alert('Failed to copy: ' + err));
});

urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        generateBtn.click();
    }
});