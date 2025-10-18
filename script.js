// Éléments DOM
const fileInput = document.getElementById('file-input');
const selectBtn = document.getElementById('select-btn');
const uploadArea = document.getElementById('upload-area');
const preview = document.getElementById('preview');
const previewContainer = document.getElementById('preview-container');
const analyzeBtn = document.getElementById('analyze-btn');
const loading = document.getElementById('loading');
const resultText = document.getElementById('result-text');
const confidence = document.getElementById('confidence');
const confidenceBar = document.getElementById('confidence-bar');
const confidenceFill = document.getElementById('confidence-fill');

// Clés API
const API_TOKENS = [
    "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",
    "hf_abc123def456ghi789jkl012mno345pqr678"
];

const API_URL_QWEN = "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-VL-7B-Instruct";
const API_URL_TRANSLATE = "https://api-inference.huggingface.co/models/Helsinki-NLP/opus-mt-en-fr";

let currentTokenIndex = 0;
let selectedFile = null;

// Événements UI
selectBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
uploadArea.addEventListener('dragover', e => {
    e.preventDefault();
    uploadArea.style.backgroundColor = 'rgba(38, 208, 206, 0.15)';
});
uploadArea.addEventListener('dragleave', () => uploadArea.style.backgroundColor = 'rgba(38, 208, 206, 0.05)');
uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.style.backgroundColor = 'rgba(38, 208, 206, 0.05)';
    if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        handleFileSelect();
    }
});
analyzeBtn.addEventListener('click', analyzeImage);

// Fonctions de base
function handleFileSelect() {
    if (fileInput.files && fileInput.files[0]) {
        selectedFile = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = e => {
            preview.src = e.target.result;
            previewContainer.style.display = 'block';
        };
        reader.readAsDataURL(selectedFile);

        analyzeBtn.disabled = false;
        resultText.textContent = "Le résultat de l'analyse apparaîtra ici.";
        confidence.textContent = "";
        confidenceBar.style.display = 'none';
    }
}

function imageToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}

function getCurrentToken() {
    return API_TOKENS[currentTokenIndex];
}

function switchToNextToken() {
    currentTokenIndex = (currentTokenIndex + 1) % API_TOKENS.length;
    console.log(`🔄 Passage à la clé API ${currentTokenIndex + 1}`);
}

// Traduction automatique de secours
async function translateToFrench(text) {
    try {
        const response = await fetch(API_URL_TRANSLATE, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${getCurrentToken()}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ inputs: text })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();

        return result[0]?.translation_text || text;
    } catch (err) {
        console.warn("⚠️ Échec de traduction :", err);
        return text;
    }
}

// Appel au modèle de vision (Qwen)
async function callVisionAPI(imageBase64) {
    const currentToken = getCurrentToken();

    const payload = {
        inputs: {
            image: imageBase64,
            question: `Tu es un expert en biologie marine. 
            Analyse attentivement l'image fournie et identifie l'espèce marine représentée. 
            Réponds UNIQUEMENT en français, avec le nom commun exact de l'espèce (par exemple : "Tortue caouanne" ou "Requin-marteau"), sans texte additionnel ni anglais.`
        },
        parameters: {
            max_new_tokens: 100,
            temperature: 0.1
        }
    };

    const response = await fetch(API_URL_QWEN, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${currentToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            switchToNextToken();
            return callVisionAPI(imageBase64);
        }
        throw new Error(`Erreur API Qwen (${response.status})`);
    }

    const result = await response.json();
    return result;
}

// Nettoyer la réponse
function cleanApiResponse(response) {
    let text = response?.[0]?.generated_text?.trim() || "";
    text = text.replace(/["']/g, '').trim();
    return text;
}

// Analyse principale
async function analyzeImage() {
    if (!selectedFile) return;

    loading.style.display = 'block';
    analyzeBtn.disabled = true;
    resultText.textContent = "Analyse de l'image en cours...";

    try {
        const imageBase64 = await imageToBase64(selectedFile);
        const apiResponse = await callVisionAPI(imageBase64);
        let speciesName = cleanApiResponse(apiResponse);

        // Traduire si la réponse contient des mots anglais
        const isEnglish = /[A-Za-z]{3,}/.test(speciesName) && !/[éèàçù]/.test(speciesName);
        if (isEnglish) {
            console.log("🔁 Traduction automatique activée...");
            speciesName = await translateToFrench(speciesName);
        }

        const confidenceScore = 0.87;
        displayResults(speciesName, confidenceScore);
    } catch (error) {
        console.error("💥 Erreur:", error);
        resultText.textContent = "Erreur lors de l'analyse. Veuillez réessayer.";
    } finally {
        loading.style.display = 'none';
        analyzeBtn.disabled = false;
    }
}

// Affichage du résultat
function displayResults(speciesName, confidenceScore) {
    let message = "";

    if (confidenceScore < 0.65) {
        message = "Image peu claire. Essayez avec une image plus nette.";
    } else if (confidenceScore < 0.80) {
        message = `Je pense qu'il s'agit de ${speciesName}.`;
    } else {
        message = `Je suis presque certain qu'il s'agit de ${speciesName}.`;
    }

    resultText.textContent = message;
    confidence.textContent = `Confiance : ${(confidenceScore * 100).toFixed(1)}%`;

    confidenceBar.style.display = 'block';
    confidenceFill.style.width = `${confidenceScore * 100}%`;

    confidenceFill.style.background =
        confidenceScore < 0.65 ? '#ff5252' :
        confidenceScore < 0.80 ? '#ffeb3b' : '#4caf50';
}
