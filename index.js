const express = require('express');
const canvas = require('canvas');
const faceapi = require('face-api.js');
const multer = require('multer');
const { Canvas, Image, ImageData } = canvas;

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Configuración de multer para manejar la carga de archivos
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Configuración de face-api.js
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
const MODEL_URL = './models';
const faceExpressionNet = faceapi.nets.faceExpressionNet;


// Este es el original pero modificamos las expresiones a las que vamos a usar
// const emotionTranslations = {
//   neutral: 'Neutral',
//   happy: 'Feliz',
//   sad: 'Triste',
//   angry: 'Enojado',
//   fearful: 'Asustado',
//   disgusted: 'Disgustado',
//   surprised: 'Sorprendido'
// };

const emotionTranslations = {
  neutral: 'Calma',
  happy: 'Alegria',
  sad: 'Tristeza',
  angry: 'Enojo',
  fearful: 'Tristeza',
  disgusted: 'Tristeza',
  surprised: 'Sorpresa'
};

Promise.all([
  faceExpressionNet.loadFromDisk(MODEL_URL),
  faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_URL)
])
  .then(() => {
    console.log('Modelos cargados. El servidor está listo.');
    startServer();
  })
  .catch((error) => {
    console.error('Error al cargar los modelos:', error);
  });

function startServer() {
  app.listen(port, () => {
    console.log(`El servidor está escuchando en el puerto ${port}`);
  });
}

app.use('/detect-emotion', upload.array('images', 15));
app.post('/detect-emotion', async (req, res) => {

  const images = req.files;
  if (!images || images.length === 0) {
    return res.status(405).json({ error: 'No se han enviado imágenes' });
  }

  const emotionPredictionStr = req.body.emotionPrediction;
  const percentage = parseInt(req.body.percentage);
  const consecutiveRecognition = parseInt(req.body.consecutiveRecognitionSuccess);

  try {
    const emotionsResponses = {};

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const imageBuffer = image.buffer;
      const imageResult = {};

      const img = new Image();
      img.src = imageBuffer;

      // Detección de emociones
      const detections = await faceapi.detectSingleFace(img).withFaceExpressions();

      if (!detections) {
        imageResult.emotion = 'No se detectó ninguna cara en la imagen.';
      } else {
        const emotions = detections.expressions;
        const highestEmotion = Object.keys(emotions).reduce((a, b) => (emotions[a] > emotions[b] ? a : b));
        imageResult.emotion = emotionTranslations[highestEmotion] || highestEmotion;
      }
      emotionsResponses[`emotion_${i + 1}`] = imageResult.emotion;
    }

    const feasibilityResult = analyzeFeasibility(emotionPredictionStr, emotionsResponses, percentage, consecutiveRecognition);
    res.json(feasibilityResult);
  } catch (error) {
    console.error('Error al cargar o procesar las imágenes:', error);
    return res.status(505).json({ error: 'Error al procesar las imágenes.' });
  }
});

function analyzeFeasibility(emotionPredictionStr, results, percentage, consecutiveRecognition) {
  let numberOfHits = 0;
  let reliability = 0.0;
  let consecutiveEmotions = 0; // Contador de emociones consecutivas

  // Primer criterio: Obtener una fiabilidad del x%
  for (const key in results) {
    const emotion = results[key];
    if (emotionPredictionStr.toLowerCase() === emotion.toLowerCase()) {
      numberOfHits += 1;
    }
  }
  reliability = (numberOfHits / Object.keys(results).length) * 100;

  // Segundo criterio: Obtener una x cantidad de aciertos consecutivos
  for (const key in results) {
    const emotion = results[key];
    if (emotionPredictionStr.toLowerCase() === emotion.toLowerCase()) {
      consecutiveEmotions += 1;
      if (consecutiveEmotions >= consecutiveRecognition) {
        break;
      }
    } else {
      consecutiveEmotions = 0;
    }
  }

  const response_data = {
    success: reliability > percentage || consecutiveEmotions >= consecutiveRecognition,
    reliability: parseFloat(reliability.toFixed(2)),
    consecutive_recognition: consecutiveEmotions,
    emotion_prediction: emotionPredictionStr,
    results: results
  };

  return response_data;
}