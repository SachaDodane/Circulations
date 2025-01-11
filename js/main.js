// Configuration de la carte
let map;
let userMarker;
let currentPosition = null; // Position actuelle de l'utilisateur
const nancyCoordinates = [48.6921, 6.1844]; // Uniquement pour les vélos
const weatherApiKey = '775786b09c177429efbfba7f94aeb3fb';

// Configuration
const maxDistance = 1000; // Distance maximale en mètres pour les stations de vélos

// Variables pour stocker les instances des graphiques
let covidChart1 = null;
let covidChart2 = null;
let covidChart3 = null;

// Initialisation de la carte avec la position de l'utilisateur
function initMap(position) {
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    currentPosition = [latitude, longitude];

    if (!map) {
        map = L.map('map').setView(currentPosition, 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: ' OpenStreetMap contributors'
        }).addTo(map);
    } else {
        map.setView(currentPosition, 13);
    }

    // Mise à jour du marqueur de l'utilisateur
    if (userMarker) {
        userMarker.setLatLng(currentPosition);
    } else {
        userMarker = L.marker(currentPosition).addTo(map);
    }
    userMarker.bindPopup('Votre position').openPopup();
}

// Gestion des erreurs de géolocalisation
function handleGeolocationError(error) {
    console.error('Erreur de géolocalisation:', error);
    document.getElementById('current-location').textContent = 
        'Impossible d\'obtenir votre position. Utilisation de la position par défaut.';
    
    // Utiliser la position actuelle ou Nancy par défaut
    const position = currentPosition ? { coords: { latitude: currentPosition[0], longitude: currentPosition[1] } } 
                                   : { coords: { latitude: nancyCoordinates[0], longitude: nancyCoordinates[1] } };

    // Mise à jour du titre avec la ville par défaut
    document.querySelector('h1').textContent = 'Nancy - Informations en temps réel';

    // Initialisation avec la position par défaut
    initMap(position);

    // Chargement des données
    Promise.all([
        loadWeather(position.coords.latitude, position.coords.longitude),
        loadAirQuality(position.coords.latitude, position.coords.longitude),
        loadBikeStations(nancyCoordinates[0], nancyCoordinates[1]), // Toujours utiliser Nancy pour les vélos
        loadCovidData(position.coords.latitude, position.coords.longitude)
    ]);
}

// Variables globales pour stocker les données
let currentConditions = {
    weather: null,
    airQuality: null,
    nearestStation: null
};

// Chargement des stations de vélos
async function loadBikeStations(lat, lon) {
    try {
        // Informations des stations
        const stationInfoResponse = await fetch('https://api.cyclocity.fr/contracts/nancy/gbfs/station_information.json', {
            headers: {
                'Accept': 'application/json'
            }
        });
        const stationStatusResponse = await fetch('https://api.cyclocity.fr/contracts/nancy/gbfs/station_status.json', {
            headers: {
                'Accept': 'application/json'
            }
        });
        
        const stationInfo = await stationInfoResponse.json();
        const stationStatus = await stationStatusResponse.json();
        
        console.log('Stations info:', stationInfo);
        console.log('Stations status:', stationStatus);
        
        if (stationInfo.data && stationInfo.data.stations) {
            stationInfo.data.stations.forEach(station => {
                // Trouver le statut correspondant
                const status = stationStatus.data.stations.find(s => s.station_id === station.station_id);
                
                if (status) {
                    const bikeIcon = L.divIcon({
                        className: 'bike-station-icon',
                        html: `<div class="station-marker">${status.num_bikes_available}</div>`,
                        iconSize: [30, 30]
                    });

                    L.marker([station.lat, station.lon], {icon: bikeIcon})
                        .addTo(map)
                        .bindPopup(`
                            <b>${station.name}</b><br>
                            Vélos disponibles: ${status.num_bikes_available}<br>
                            Places libres: ${status.num_docks_available}<br>
                            Dernière mise à jour: ${new Date(status.last_reported * 1000).toLocaleString()}
                        `);
                }
            });
        }
    } catch (error) {
        console.error('Erreur lors du chargement des stations:', error);
        document.getElementById('bikes-section').innerHTML += `
            <div class="error-message">
                Impossible de charger les stations de vélos. Erreur: ${error.message}
            </div>
        `;
    }
}

// Chargement de la qualité de l'air
async function loadAirQuality(lat, lon) {
    try {
        const response = await fetch(`https://api.waqi.info/feed/geo:${lat};${lon}/?token=145b55dda74ccda038406bff403842d6e22ae1b5`);
        const data = await response.json();
        
        if (data.status === 'ok') {
            const aqi = data.data.aqi;
            let qualityLevel = '';
            let color = '';
            let icon = '';

            if (aqi <= 50) {
                qualityLevel = 'Bonne';
                color = '#009966';
                icon = '😊';
            } else if (aqi <= 100) {
                qualityLevel = 'Modérée';
                color = '#ffde33';
                icon = '😐';
            } else if (aqi <= 150) {
                qualityLevel = 'Mauvaise pour les groupes sensibles';
                color = '#ff9933';
                icon = '😷';
            } else {
                qualityLevel = 'Mauvaise';
                color = '#cc0033';
                icon = '⚠️';
            }

            document.getElementById('air-quality-info').innerHTML = `
                <div style="background-color: ${color}; padding: 15px; border-radius: 8px; color: white;">
                    <h3>Qualité de l'air ${icon}</h3>
                    <p>Niveau: ${qualityLevel}</p>
                    <p>Indice AQI: ${aqi}</p>
                    <p>Dernière mise à jour: ${new Date(data.data.time.iso).toLocaleString()}</p>
                </div>
            `;
            currentConditions.airQuality = data.data;
        }
    } catch (error) {
        console.error('Erreur lors du chargement de la qualité de l\'air:', error);
    }
}

// Chargement de la météo
async function loadWeather(lat, lon) {
    try {
        // Utiliser l'API directement avec les bonnes données de test
        const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=fr&appid=${weatherApiKey}`;
        console.log('Fetching weather from:', weatherUrl);
        
        const response = await fetch(weatherUrl);
        const data = await response.json();
        
        console.log('Weather data:', data);

        if (!data || data.cod !== 200) {
            throw new Error(data.message || 'Erreur lors de la récupération des données météo');
        }

        const weatherSection = document.createElement('section');
        weatherSection.id = 'weather-section';
        weatherSection.innerHTML = `
            <h2>Météo actuelle à ${data.name}</h2>
            <div class="weather-info">
                <p>Température: ${Math.round(data.main.temp)}°C</p>
                <p>Ressenti: ${Math.round(data.main.feels_like)}°C</p>
                <p>Humidité: ${data.main.humidity}%</p>
                <p>Vent: ${Math.round(data.wind.speed * 3.6)} km/h</p>
                <p>Conditions: ${data.weather[0].description}</p>
            </div>
        `;

        // Ajouter des recommandations pour l'utilisation des vélos
        const shouldUseBike = data.main.temp > 5 && data.main.temp < 30 && 
                            data.wind.speed < 30 && 
                            !['Rain', 'Snow', 'Thunderstorm'].includes(data.weather[0].main);

        weatherSection.innerHTML += `
            <div class="bike-recommendation">
                <h3>Recommandation vélo</h3>
                <p>${shouldUseBike ? 
                    ' Les conditions sont favorables pour utiliser un vélo!' : 
                    ' Les conditions météorologiques ne sont pas idéales pour le vélo.'}</p>
            </div>
        `;

        const existingWeatherSection = document.getElementById('weather-section');
        if (existingWeatherSection) {
            existingWeatherSection.remove();
        }
        document.querySelector('main').insertBefore(weatherSection, document.getElementById('bikes-section'));
        currentConditions.weather = data;
    } catch (error) {
        console.error('Erreur lors du chargement de la météo:', error);
        const weatherSection = document.createElement('section');
        weatherSection.id = 'weather-section';
        weatherSection.innerHTML = `
            <h2>Météo</h2>
            <div class="error-message">
                Impossible de charger les données météo. Erreur: ${error.message}
            </div>
        `;
        document.querySelector('main').insertBefore(weatherSection, document.getElementById('bikes-section'));
    }
}

// Fonction pour parser le CSV
function parseCSV(csv) {
    // Afficher les 500 premiers caractères pour voir le format exact
    console.log("Premiers caractères du CSV:", csv.substring(0, 500));
    
    const lines = csv.split('\n');
    console.log("Première ligne (headers):", lines[0]);
    console.log("Deuxième ligne (exemple):", lines[1]);
    
    // Essayons de détecter le séparateur
    const firstLine = lines[0];
    const separators = ['\t', ';', ','];
    let separator = '\t';
    for (const sep of separators) {
        if (firstLine.split(sep).length > 1) {
            separator = sep;
            break;
        }
    }
    console.log("Séparateur détecté:", separator === '\t' ? "tab" : separator);
    
    const headers = lines[0].split(separator);
    console.log("Headers trouvés:", headers);
    
    const depIndex = headers.indexOf('dep');
    const dateIndex = headers.indexOf('jour');
    const sexeIndex = headers.indexOf('sexe');
    const hospIndex = headers.indexOf('hosp');
    const reaIndex = headers.indexOf('rea');

    console.log("Indices:", { depIndex, dateIndex, sexeIndex, hospIndex, reaIndex });

    // Créer un objet pour stocker les données agrégées par département et date
    const aggregatedData = new Map();

    lines.slice(1) // Ignorer l'en-tête
        .map(line => {
            const values = line.split(separator);
            if (values.length < 5) {
                console.log("Ligne invalide (trop courte):", line);
                return null;
            }
            const record = {
                date: values[dateIndex],
                dep: values[depIndex]?.trim(),
                sexe: values[sexeIndex],
                hosp: parseInt(values[hospIndex]) || 0,
                rea: parseInt(values[reaIndex]) || 0
            };
            console.log("Record créé:", record);
            return record;
        })
        .filter(record => record && record.date && record.dep)
        .forEach(record => {
            if (record.sexe === '0') return;

            const key = `${record.dep}-${record.date}`;
            if (!aggregatedData.has(key)) {
                aggregatedData.set(key, {
                    date: record.date,
                    dep: record.dep,
                    hosp: 0,
                    rea: 0
                });
            }
            const current = aggregatedData.get(key);
            current.hosp += record.hosp;
            current.rea += record.rea;
        });

    const result = Array.from(aggregatedData.values());
    console.log("Données finales:", result);
    return result;
}

// Fonction pour obtenir les données COVID d'un département
async function getCovidDataForDepartment(departmentCode) {
    try {
        // S'assurer que le code département est sur 2 chiffres
        const formattedDepartmentCode = departmentCode.toString().padStart(2, '0');
        
        // Utiliser l'API de données hospitalières COVID-19
        const response = await fetch('https://www.data.gouv.fr/fr/datasets/r/5c4e1452-3850-4b59-b11c-3dd51d7fb8b5');
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }

        const csvText = await response.text();
        const lines = csvText.split('\n');
        
        // Parser l'en-tête pour trouver les indices des colonnes
        const headers = lines[0].split(',');
        const depIndex = headers.indexOf('dep');
        const dateIndex = headers.indexOf('date');
        const hospIndex = headers.indexOf('hosp');
        const reaIndex = headers.indexOf('rea');

        // Vérifier que toutes les colonnes nécessaires sont présentes
        if (depIndex === -1 || dateIndex === -1 || hospIndex === -1 || reaIndex === -1) {
            throw new Error('Format de données invalide');
        }

        // Parser et filtrer les données
        const allData = lines.slice(1) // Ignorer l'en-tête
            .map(line => {
                const values = line.split(',');
                if (values.length < Math.max(depIndex, dateIndex, hospIndex, reaIndex) + 1) return null;
                
                return {
                    dep: values[depIndex].trim().replace(/"/g, ''),
                    date: values[dateIndex].trim().replace(/"/g, ''),
                    hosp: parseInt(values[hospIndex]) || 0,
                    rea: parseInt(values[reaIndex]) || 0
                };
            })
            .filter(record => record && record.dep === formattedDepartmentCode);

        // Trier et prendre les 30 derniers jours
        const departmentData = allData
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 30)
            .map(record => ({
                date: new Date(record.date).toLocaleDateString('fr-FR'),
                hosp: record.hosp,
                rea: record.rea
            }))
            .reverse();

        if (departmentData.length === 0) {
            throw new Error(`Aucune donnée disponible pour le département ${formattedDepartmentCode}`);
        }

        return {
            lastUpdate: departmentData[departmentData.length - 1].date,
            department: formattedDepartmentCode,
            data: departmentData
        };
    } catch (error) {
        console.error('Erreur lors de la récupération des données COVID:', error);
        throw error;
    }
}

// Chargement des données COVID
async function loadCovidData(lat, lon) {
    try {
        // Obtenir le département en fonction des coordonnées
        const response = await fetch(`https://geo.api.gouv.fr/communes?lat=${lat}&lon=${lon}&fields=departement`);
        if (!response.ok) {
            throw new Error('Erreur lors de la récupération du département');
        }
        
        const data = await response.json();
        if (!data || data.length === 0 || !data[0].departement) {
            throw new Error('Département non trouvé');
        }

        const departmentCode = data[0].departement.code;
        const departmentName = data[0].departement.nom;

        // Récupérer les données COVID pour ce département
        const covidData = await getCovidDataForDepartment(departmentCode);
        
        const dates = covidData.data.map(record => new Date(record.date.split('/').reverse().join('-')).toLocaleDateString());
        const hospitalizations = covidData.data.map(record => record.hosp);
        const icu = covidData.data.map(record => record.rea);

        // Vérifier si les éléments canvas existent
        const canvas1 = document.getElementById('covidChart1');
        const canvas2 = document.getElementById('covidChart2');
        const canvas3 = document.getElementById('covidChart3');

        if (!canvas1 || !canvas2 || !canvas3) {
            throw new Error('Les éléments canvas pour les graphiques COVID sont manquants');
        }

        // Configuration commune des graphiques
        const commonOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        };

        // Détruire les graphiques existants s'ils existent
        if (covidChart1) {
            covidChart1.destroy();
            covidChart1 = null;
        }
        if (covidChart2) {
            covidChart2.destroy();
            covidChart2 = null;
        }
        if (covidChart3) {
            covidChart3.destroy();
            covidChart3 = null;
        }

        // Créer les nouveaux graphiques
        const ctx1 = canvas1.getContext('2d');
        covidChart1 = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Hospitalisations',
                    data: hospitalizations,
                    borderColor: 'rgb(255, 99, 132)',
                    tension: 0.1,
                    fill: false
                }]
            },
            options: {
                ...commonOptions,
                plugins: {
                    ...commonOptions.plugins,
                    title: {
                        display: true,
                        text: `Hospitalisations COVID - ${departmentName} (${departmentCode})`
                    }
                }
            }
        });

        const ctx2 = canvas2.getContext('2d');
        covidChart2 = new Chart(ctx2, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Patients en soins critiques',
                    data: icu,
                    borderColor: 'rgb(54, 162, 235)',
                    tension: 0.1,
                    fill: false
                }]
            },
            options: {
                ...commonOptions,
                plugins: {
                    ...commonOptions.plugins,
                    title: {
                        display: true,
                        text: `Patients en soins critiques - ${departmentName} (${departmentCode})`
                    }
                }
            }
        });

        const ctx3 = canvas3.getContext('2d');
        covidChart3 = new Chart(ctx3, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Hospitalisations',
                    data: hospitalizations,
                    borderColor: 'rgb(255, 99, 132)',
                    tension: 0.1,
                    fill: false
                }, {
                    label: 'Soins critiques',
                    data: icu,
                    borderColor: 'rgb(54, 162, 235)',
                    tension: 0.1,
                    fill: false
                }]
            },
            options: {
                ...commonOptions,
                plugins: {
                    ...commonOptions.plugins,
                    title: {
                        display: true,
                        text: `Evolution des hospitalisations - ${departmentName} (${departmentCode})`
                    }
                }
            }
        });

        // Mise à jour du timestamp
        updateTimestamp('covid-update-time');

        // Ajout d'une note sur la source des données
        const covidDataContainer = document.getElementById('covid-data');
        if (covidDataContainer) {
            const chartsContainer = covidDataContainer.querySelector('.charts-container');
            if (chartsContainer) {
                const sourceElement = document.createElement('p');
                sourceElement.className = 'data-source';
                sourceElement.innerHTML = `Source : Santé Publique France<br>`;
                covidDataContainer.insertBefore(sourceElement, chartsContainer.nextSibling);
            }
        }

    } catch (error) {
        console.error('Erreur lors du chargement des données COVID:', error);
        const covidDataContainer = document.getElementById('covid-data');
        if (covidDataContainer) {
            covidDataContainer.innerHTML = `
                <h2>Données COVID-19</h2>
                <div class="error-message">
                    Impossible de charger les données COVID.</p>
                    <p>Les données sont mises à jour quotidiennement par Santé Publique France.</p>
                    <p><small>Erreur technique : ${error.message}</small></p>
                </div>
                <div class="charts-container">
                    <div class="chart-wrapper">
                        <canvas id="covidChart1"></canvas>
                    </div>
                    <div class="chart-wrapper">
                        <canvas id="covidChart2"></canvas>
                    </div>
                    <div class="chart-wrapper">
                        <canvas id="covidChart3"></canvas>
                    </div>
                </div>
            `;
        }
    }
}

// Fonction pour obtenir le nom de la ville à partir des coordonnées
async function getCityFromCoordinates(latitude, longitude) {
    try {
        const response = await fetch(`https://geo.api.gouv.fr/communes?lat=${latitude}&lon=${longitude}&fields=nom`);
        if (!response.ok) {
            throw new Error('Erreur lors de la récupération de la ville');
        }
        const data = await response.json();
        if (data && data.length > 0) {
            return data[0].nom;
        }
        return 'Ville inconnue';
    } catch (error) {
        console.error('Erreur:', error);
        return 'Ville inconnue';
    }
}

// Calcul de la moyenne mobile
function calculateMovingAverage(data, window) {
    return data.map((val, idx, arr) => {
        const start = Math.max(0, idx - window + 1);
        const count = Math.min(window, idx + 1);
        return arr.slice(start, idx + 1).reduce((a, b) => a + b) / count;
    });
}

// Calcul du niveau de risque basé sur la concentration virale
function calculateRiskLevel(concentration) {
    if (concentration < 1000) return 0;
    if (concentration < 10000) return 1;
    if (concentration < 100000) return 2;
    if (concentration < 1000000) return 3;
    return 4;
}

// Obtention de la couleur en fonction du niveau de risque
function getRiskColor(level) {
    const colors = [
        'rgba(75, 192, 192, 0.8)',  // Nul - Vert
        'rgba(255, 206, 86, 0.8)',  // Faible - Jaune
        'rgba(255, 159, 64, 0.8)',  // Modéré - Orange
        'rgba(255, 99, 132, 0.8)',  // Élevé - Rouge
        'rgba(153, 102, 255, 0.8)'  // Très élevé - Violet
    ];
    return colors[level];
}

// Évaluation des conditions pour le vélo
function evaluateBikeConditions() {
    const factors = [];
    let totalWeight = 0;
    let totalScore = 0;

    // Vérification de la météo si disponible
    if (currentConditions.weather) {
        // Température
        const temp = currentConditions.weather.main.temp;
        const tempScore = temp > 5 && temp < 30 ? 1 : 0;
        factors.push({
            name: 'Température',
            status: tempScore === 1,
            icon: '🌡️',
            message: `${Math.round(temp)}°C - ${tempScore === 1 ? 'Favorable' : 'Défavorable'}`
        });
        totalScore += tempScore;
        totalWeight++;

        // Vent
        const windSpeed = currentConditions.weather.wind.speed * 3.6;
        const windScore = windSpeed < 30 ? 1 : 0;
        factors.push({
            name: 'Vent',
            status: windScore === 1,
            icon: '💨',
            message: `${Math.round(windSpeed)} km/h - ${windScore === 1 ? 'Favorable' : 'Trop fort'}`
        });
        totalScore += windScore;
        totalWeight++;

        // Pluie
        const isRaining = currentConditions.weather.weather[0].main === 'Rain';
        const rainScore = !isRaining ? 1 : 0;
        factors.push({
            name: 'Précipitations',
            status: rainScore === 1,
            icon: '🌧️',
            message: isRaining ? 'Pluie en cours' : 'Pas de pluie'
        });
        totalScore += rainScore;
        totalWeight++;
    }

    // Vérification de la qualité de l'air si disponible
    if (currentConditions.airQuality) {
        const aqi = currentConditions.airQuality.aqi;
        const aqiScore = aqi <= 100 ? 1 : 0;
        factors.push({
            name: 'Qualité de l\'air',
            status: aqiScore === 1,
            icon: '🌬️',
            message: `AQI: ${aqi} - ${aqiScore === 1 ? 'Acceptable' : 'Mauvaise'}`
        });
        totalScore += aqiScore;
        totalWeight++;
    }

    // Vérification des vélos si disponible
    if (currentConditions.nearestStation) {
        const bikes = currentConditions.nearestStation.num_bikes_available;
        const bikeScore = bikes > 0 ? 1 : 0;
        factors.push({
            name: 'Vélos disponibles',
            status: bikeScore === 1,
            icon: '🚲',
            message: `${bikes} vélo${bikes > 1 ? 's' : ''} disponible${bikes > 1 ? 's' : ''}`
        });
        totalScore += bikeScore;
        totalWeight++;
    }

    // Calcul du score final (au moins 60% de conditions favorables)
    const finalScore = totalWeight > 0 ? totalScore / totalWeight : 0;
    const isRecommended = finalScore >= 0.6;

    return {
        recommended: isRecommended,
        factors: factors,
        message: isRecommended ? 
            "Les conditions sont favorables pour utiliser un vélo !" :
            "Les conditions ne sont pas idéales pour le vélo."
    };
}

// Mise à jour de l'affichage des recommandations
function updateRecommendationDisplay(evaluation) {
    const container = document.getElementById('bike-recommendation');
    container.className = `recommendation-container ${evaluation.recommended ? 'favorable' : 'unfavorable'}`;

    let html = `
        <h3>${evaluation.recommended ? '✅' : '❌'} ${evaluation.message}</h3>
        <div class="factors">
            ${evaluation.factors.map(factor => `
                <div class="factor">
                    <span class="factor-icon">${factor.icon}</span>
                    <span>${factor.name}: ${factor.message}</span>
                </div>
            `).join('')}
        </div>
    `;

    container.innerHTML = html;
}

// Mise à jour des timestamps
function updateTimestamp(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = new Date().toLocaleString();
    }
}

// Géolocalisation IP
async function getIPLocation() {
    try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        document.getElementById('ip-location').innerHTML = 
            `Votre localisation IP indique : ${data.city}, ${data.region}, ${data.country_name}<br>` +
            `<small>Pour plus de précision, nous utilisons la localisation de votre navigateur.</small>`;
    } catch (error) {
        console.error('Erreur lors de la géolocalisation IP:', error);
    }
}

// Initialisation
async function init() {
    try {
        // Lancer la géolocalisation IP en parallèle (juste pour information)
        getIPLocation();

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    // Obtenir le nom de la ville
                    const cityName = await getCityFromCoordinates(position.coords.latitude, position.coords.longitude);
                    
                    // Mise à jour du titre
                    document.querySelector('h1').textContent = `${cityName} - Informations en temps réel`;
                    
                    // Mise à jour de l'affichage de la position
                    document.getElementById('current-location').textContent = 
                        `Position : ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;

                    // Initialisation de la carte
                    initMap(position);

                    // Chargement des données
                    await Promise.all([
                        loadWeather(position.coords.latitude, position.coords.longitude),
                        loadAirQuality(position.coords.latitude, position.coords.longitude),
                        loadBikeStations(nancyCoordinates[0], nancyCoordinates[1]), // Toujours utiliser Nancy pour les vélos
                        loadCovidData(position.coords.latitude, position.coords.longitude)
                    ]);

                    // Mise à jour des timestamps
                    updateTimestamp('update-time');
                    updateTimestamp('weather-update-time');
                    updateTimestamp('air-update-time');
                    updateTimestamp('bikes-update-time');
                    updateTimestamp('covid-update-time');

                    // Évaluation et affichage des recommandations
                    const evaluation = evaluateBikeConditions();
                    updateRecommendationDisplay(evaluation);
                },
                handleGeolocationError
            );
        } else {
            handleGeolocationError();
        }
    } catch (error) {
        console.error('Erreur lors de l\'initialisation:', error);
        handleGeolocationError();
    }
}

// Lancement de l'application
document.addEventListener('DOMContentLoaded', init);
