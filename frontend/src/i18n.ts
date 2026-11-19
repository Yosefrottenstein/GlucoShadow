// Simple, dependency-free translations for the app's own text. English is always the fallback,
// so a screen that hasn't been translated yet (or a key that's missing from a language) just
// shows English instead of breaking.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

export type Lang = "en" | "fr" | "es";
export const LANGUAGES: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
];

const KEY = "language";

// English text is the dictionary key itself, so nothing breaks if a key is missing in fr/es.
const fr: Record<string, string> = {
  "Welcome to GlucoShadow": "Bienvenue sur GlucoShadow",
  "Choose your language": "Choisissez votre langue",
  "You can change this later in Settings.": "Vous pouvez le changer plus tard dans Réglages.",
  Continue: "Continuer",
  Settings: "Réglages",
  Appearance: "Apparence",
  "Light, dark, and graph height": "Clair, sombre et hauteur du graphique",
  "Glucose & ranges": "Glycémie et plages",
  "Units, target range and tight range": "Unités, plage cible et plage serrée",
  "Data source": "Source des données",
  "Where your glucose readings come from": "D'où viennent vos mesures de glycémie",
  "Sensor session": "Session du capteur",
  "Start, stop and sensor-ending reminders": "Démarrer, arrêter et rappels de fin de capteur",
  Alarms: "Alarmes",
  "Alarms, emergency messages and Shabbat mode": "Alarmes, messages d'urgence et mode Shabbat",
  "Upload to cloud": "Envoyer vers le cloud",
  "Nightscout, Tidepool and Dexcom Share": "Nightscout, Tidepool et Dexcom Share",
  Profile: "Profil",
  "Name, username, email, password and photo": "Nom, nom d'utilisateur, e-mail, mot de passe et photo",
  "Light or dark": "Clair ou sombre",
  "Match phone": "Comme le téléphone",
  Light: "Clair",
  Dark: "Sombre",
  "Dark uses deep, low-glare colours for checking glucose at night.": "Le mode sombre utilise des couleurs peu éblouissantes pour vérifier la glycémie la nuit.",
  "Graph height": "Hauteur du graphique",
  "Glucose unit": "Unité de glycémie",
  "Target range": "Plage cible",
  "Save": "Enregistrer",
  Language: "Langue",
  "Username": "Nom d'utilisateur",
  Password: "Mot de passe",
  "Log in": "Connexion",
  "Create account": "Créer un compte",
  Home: "Accueil",
  History: "Historique",
  Stats: "Statistiques",
  "Settings and tools": "Réglages et outils",
  "Not used while following another device": "Non utilisé en mode suiveur",
  "Could not reach the server.": "Impossible de joindre le serveur.",
  "Try again": "Réessayer",
  "Shabbat mode": "Mode Shabbat",
  Since: "Depuis",
  "emergency contacts alerted": "contacts d'urgence alertés",
  Snooze: "Reporter",
  "Bluetooth sensor": "Capteur Bluetooth",
  "Readings appear here when the sensor sends one (every 5 minutes).": "Les mesures apparaissent ici dès que le capteur en envoie une (toutes les 5 minutes).",
  "No readings yet. Pick a data source in Settings.": "Aucune mesure pour l'instant. Choisissez une source de données dans Réglages.",
  "Slide the box to look back · double-tap or pinch to zoom · hold to see everything": "Faites glisser le cadre pour revenir en arrière · double-tapez ou pincez pour zoomer · maintenez pour tout voir",
  "In range today": "Dans la plage aujourd'hui",
  Average: "Moyenne",
  Readings: "Mesures",
  "Last 24 hours": "Dernières 24 heures",
  "No insulin, carbs or notes logged.": "Aucune insuline, glucide ou note enregistré.",
  "U insulin": "U insuline",
  "g carbs": "g de glucides",
  Calibration: "Calibration",
  Note: "Note",
  "Time format": "Format de l'heure",
  "24-hour (14:30)": "24 heures (14:30)",
  "12-hour (2:30 PM)": "12 heures (2:30 PM)",
  "New sensors need this time before their first reading.": "Les nouveaux capteurs ont besoin de ce délai avant leur première mesure.",
  "Sign in to see your glucose.": "Connectez-vous pour voir votre glycémie.",
  "Forgot your password? We'll email a code to the address on your account.": "Mot de passe oublié ? Nous enverrons un code à l'adresse de votre compte.",
  "Enter the code and choose a new password.": "Entrez le code et choisissez un nouveau mot de passe.",
  "Forgot your username? Enter the email address you added to your account and we'll send a code.": "Nom d'utilisateur oublié ? Entrez l'adresse e-mail de votre compte et nous enverrons un code.",
  "Enter the code we emailed you.": "Entrez le code que nous vous avons envoyé par e-mail.",
  "Your username": "Votre nom d'utilisateur",
  "Create your private account. Step 1 of 3": "Créez votre compte privé. Étape 1 sur 3",
  "Step 2 of 3 — recovery email": "Étape 2 sur 3 — e-mail de récupération",
  "Step 3 of 3 — before you start": "Étape 3 sur 3 — avant de commencer",
  "Sign in": "Se connecter",
  "Send code": "Envoyer le code",
  "Set new password": "Définir le nouveau mot de passe",
  "Show my username": "Afficher mon nom d'utilisateur",
  "Change my username": "Changer mon nom d'utilisateur",
  "Next": "Suivant",
  "Create account": "Créer un compte",
  "Username can't contain spaces.": "Le nom d'utilisateur ne peut pas contenir d'espaces.",
  "Username needs at least 5 characters.": "Le nom d'utilisateur doit comporter au moins 5 caractères.",
  "Username can use letters, numbers, dots and underscores.": "Le nom d'utilisateur peut contenir des lettres, des chiffres, des points et des tirets bas.",
  "Enter your username.": "Entrez votre nom d'utilisateur.",
  "Enter your password.": "Entrez votre mot de passe.",
  "If no email was added to this account, the password can't be recovered.": "Si aucun e-mail n'a été ajouté à ce compte, le mot de passe ne peut pas être récupéré.",
  "Enter the 6-digit code from the email.": "Entrez le code à 6 chiffres reçu par e-mail.",
  "Password needs at least 8 characters.": "Le mot de passe doit comporter au moins 8 caractères.",
  "Passwords don't match.": "Les mots de passe ne correspondent pas.",
  "Enter the email address you added to your account.": "Entrez l'adresse e-mail de votre compte.",
  "Username changed.": "Nom d'utilisateur modifié.",
  "Enter your name (at least 3 characters).": "Entrez votre nom (au moins 3 caractères).",
  "Enter a valid email address, or tap Skip.": "Entrez une adresse e-mail valide, ou appuyez sur Ignorer.",
  "Please tick both boxes to continue.": "Veuillez cocher les deux cases pour continuer.",
  "Username": "Nom d'utilisateur",
  "Your name (3+ characters)": "Votre nom (3+ caractères)",
  "Used in emergency messages: \"{name}'s glucose is…\"": "Utilisé dans les messages d'urgence : « la glycémie de {name} est… »",
  "Name": "Nom",
  "Username (5+ characters, no spaces)": "Nom d'utilisateur (5+ caractères, sans espaces)",
  "Letters, numbers, dots or underscores, no spaces.": "Lettres, chiffres, points ou tirets bas, sans espaces.",
  "Email address": "Adresse e-mail",
  "If you forget your username or password, we email a 6-digit code to this address. Without it there is no way back into your account.": "Si vous oubliez votre nom d'utilisateur ou votre mot de passe, nous envoyons un code à 6 chiffres à cette adresse. Sans elle, il n'y a aucun moyen de récupérer l'accès à votre compte.",
  "You can add, change, or remove this recovery email anytime later in Settings.": "Vous pouvez ajouter, modifier ou supprimer cet e-mail de récupération à tout moment dans Réglages.",
  "6-digit code": "Code à 6 chiffres",
  "New username (optional)": "Nouveau nom d'utilisateur (facultatif)",
  "Password": "Mot de passe",
  "New password (8+ characters)": "Nouveau mot de passe (8+ caractères)",
  "Password (8+ characters)": "Mot de passe (8+ caractères)",
  "Repeat password": "Répétez le mot de passe",
  "GlucoShadow is not a medical device.": "GlucoShadow n'est pas un dispositif médical.",
  "GlucoShadow has not been tested or approved for medical use.": "GlucoShadow n'a pas été testé ni approuvé pour un usage médical.",
  "GlucoShadow does not replace your official sensor application (such as Dexcom, Libre, Medtronic or Omnipod). You must keep the official application running, with its alarms enabled.":
    "GlucoShadow ne remplace pas votre application officielle de capteur (comme Dexcom, Libre, Medtronic ou Omnipod). Vous devez garder l'application officielle active, avec ses alarmes activées.",
  "Do not use this application for real-time decisions. Always rely on your official applications and systems before making any decision regarding your health and well-being.":
    "N'utilisez pas cette application pour des décisions en temps réel. Fiez-vous toujours à vos applications et systèmes officiels avant de prendre une décision concernant votre santé et votre bien-être.",
  "Readings, alarms and emergency messages may be delayed, inaccurate, or may fail to be delivered, for example because of a powered-off phone, lack of signal, a Bluetooth interruption or a server outage.":
    "Les mesures, alarmes et messages d'urgence peuvent être retardés, inexacts ou ne pas être livrés, par exemple en cas de téléphone éteint, d'absence de signal, d'interruption Bluetooth ou de panne de serveur.",
  "The developer of this application may not be held responsible for any inconvenience caused directly or indirectly through its use.":
    "Le développeur de cette application ne peut être tenu responsable de tout inconvénient causé directement ou indirectement par son utilisation.",
  "GlucoShadow is not affiliated with, endorsed by or approved by any sensor manufacturer.": "GlucoShadow n'est affilié, approuvé ou cautionné par aucun fabricant de capteurs.",
  "I have read and understood the above, and I agree. I acknowledge that this application has not been tested for medical purposes.":
    "J'ai lu et compris ce qui précède, et j'accepte. Je reconnais que cette application n'a pas été testée à des fins médicales.",
  "I agree: NOT FOR ANY MEDICAL USE.": "J'accepte : NE PAS UTILISER À DES FINS MÉDICALES.",
  "Skip": "Ignorer",
  "Back to sign in": "Retour à la connexion",
  "Forgot username?": "Nom d'utilisateur oublié ?",
  "Forgot password?": "Mot de passe oublié ?",
  "Didn't get it? Send a new code": "Vous ne l'avez pas reçu ? Envoyer un nouveau code",
  "Back": "Retour",
};

const es: Record<string, string> = {
  "Welcome to GlucoShadow": "Bienvenido a GlucoShadow",
  "Choose your language": "Elige tu idioma",
  "You can change this later in Settings.": "Puedes cambiarlo más tarde en Ajustes.",
  Continue: "Continuar",
  Settings: "Ajustes",
  Appearance: "Apariencia",
  "Light, dark, and graph height": "Claro, oscuro y altura del gráfico",
  "Glucose & ranges": "Glucosa y rangos",
  "Units, target range and tight range": "Unidades, rango objetivo y rango estrecho",
  "Data source": "Fuente de datos",
  "Where your glucose readings come from": "De dónde provienen tus lecturas de glucosa",
  "Sensor session": "Sesión del sensor",
  "Start, stop and sensor-ending reminders": "Iniciar, detener y recordatorios de fin del sensor",
  Alarms: "Alarmas",
  "Alarms, emergency messages and Shabbat mode": "Alarmas, mensajes de emergencia y modo Shabat",
  "Upload to cloud": "Subir a la nube",
  "Nightscout, Tidepool and Dexcom Share": "Nightscout, Tidepool y Dexcom Share",
  Profile: "Perfil",
  "Name, username, email, password and photo": "Nombre, nombre de usuario, correo, contraseña y foto",
  "Light or dark": "Claro u oscuro",
  "Match phone": "Igual que el teléfono",
  Light: "Claro",
  Dark: "Oscuro",
  "Dark uses deep, low-glare colours for checking glucose at night.": "El modo oscuro usa colores poco brillantes para revisar la glucosa de noche.",
  "Graph height": "Altura del gráfico",
  "Glucose unit": "Unidad de glucosa",
  "Target range": "Rango objetivo",
  "Save": "Guardar",
  Language: "Idioma",
  "Username": "Nombre de usuario",
  Password: "Contraseña",
  "Log in": "Iniciar sesión",
  "Create account": "Crear cuenta",
  Home: "Inicio",
  History: "Historial",
  Stats: "Estadísticas",
  "Settings and tools": "Ajustes y herramientas",
  "Not used while following another device": "No se usa en modo seguidor",
  "Could not reach the server.": "No se pudo conectar con el servidor.",
  "Try again": "Intentar de nuevo",
  "Shabbat mode": "Modo Shabat",
  Since: "Desde",
  "emergency contacts alerted": "contactos de emergencia avisados",
  Snooze: "Posponer",
  "Bluetooth sensor": "Sensor Bluetooth",
  "Readings appear here when the sensor sends one (every 5 minutes).": "Las lecturas aparecen aquí en cuanto el sensor envía una (cada 5 minutos).",
  "No readings yet. Pick a data source in Settings.": "Aún no hay lecturas. Elige una fuente de datos en Ajustes.",
  "Slide the box to look back · double-tap or pinch to zoom · hold to see everything": "Desliza el recuadro para mirar atrás · doble toque o pellizca para ampliar · mantén presionado para verlo todo",
  "In range today": "En rango hoy",
  Average: "Promedio",
  Readings: "Lecturas",
  "Last 24 hours": "Últimas 24 horas",
  "No insulin, carbs or notes logged.": "No hay insulina, carbohidratos ni notas registradas.",
  "U insulin": "U de insulina",
  "g carbs": "g de carbohidratos",
  Calibration: "Calibración",
  Note: "Nota",
  "Time format": "Formato de hora",
  "24-hour (14:30)": "24 horas (14:30)",
  "12-hour (2:30 PM)": "12 horas (2:30 PM)",
  "New sensors need this time before their first reading.": "Los sensores nuevos necesitan este tiempo antes de su primera lectura.",
  "Sign in to see your glucose.": "Inicia sesión para ver tu glucosa.",
  "Forgot your password? We'll email a code to the address on your account.": "¿Olvidaste tu contraseña? Enviaremos un código a la dirección de tu cuenta.",
  "Enter the code and choose a new password.": "Ingresa el código y elige una nueva contraseña.",
  "Forgot your username? Enter the email address you added to your account and we'll send a code.": "¿Olvidaste tu nombre de usuario? Ingresa el correo de tu cuenta y enviaremos un código.",
  "Enter the code we emailed you.": "Ingresa el código que te enviamos por correo.",
  "Your username": "Tu nombre de usuario",
  "Create your private account. Step 1 of 3": "Crea tu cuenta privada. Paso 1 de 3",
  "Step 2 of 3 — recovery email": "Paso 2 de 3 — correo de recuperación",
  "Step 3 of 3 — before you start": "Paso 3 de 3 — antes de empezar",
  "Sign in": "Iniciar sesión",
  "Send code": "Enviar código",
  "Set new password": "Establecer nueva contraseña",
  "Show my username": "Mostrar mi nombre de usuario",
  "Change my username": "Cambiar mi nombre de usuario",
  "Next": "Siguiente",
  "Create account": "Crear cuenta",
  "Username can't contain spaces.": "El nombre de usuario no puede contener espacios.",
  "Username needs at least 5 characters.": "El nombre de usuario debe tener al menos 5 caracteres.",
  "Username can use letters, numbers, dots and underscores.": "El nombre de usuario puede usar letras, números, puntos y guiones bajos.",
  "Enter your username.": "Ingresa tu nombre de usuario.",
  "Enter your password.": "Ingresa tu contraseña.",
  "If no email was added to this account, the password can't be recovered.": "Si no se agregó un correo a esta cuenta, la contraseña no se puede recuperar.",
  "Enter the 6-digit code from the email.": "Ingresa el código de 6 dígitos del correo.",
  "Password needs at least 8 characters.": "La contraseña debe tener al menos 8 caracteres.",
  "Passwords don't match.": "Las contraseñas no coinciden.",
  "Enter the email address you added to your account.": "Ingresa el correo de tu cuenta.",
  "Username changed.": "Nombre de usuario cambiado.",
  "Enter your name (at least 3 characters).": "Ingresa tu nombre (al menos 3 caracteres).",
  "Enter a valid email address, or tap Skip.": "Ingresa un correo válido, o toca Omitir.",
  "Please tick both boxes to continue.": "Marca ambas casillas para continuar.",
  "Username": "Nombre de usuario",
  "Your name (3+ characters)": "Tu nombre (3+ caracteres)",
  "Used in emergency messages: \"{name}'s glucose is…\"": "Usado en mensajes de emergencia: «la glucosa de {name} es…»",
  "Name": "Nombre",
  "Username (5+ characters, no spaces)": "Nombre de usuario (5+ caracteres, sin espacios)",
  "Letters, numbers, dots or underscores, no spaces.": "Letras, números, puntos o guiones bajos, sin espacios.",
  "Email address": "Correo electrónico",
  "If you forget your username or password, we email a 6-digit code to this address. Without it there is no way back into your account.": "Si olvidas tu nombre de usuario o contraseña, enviamos un código de 6 dígitos a esta dirección. Sin él no hay forma de recuperar el acceso a tu cuenta.",
  "You can add, change, or remove this recovery email anytime later in Settings.": "Puedes agregar, cambiar o eliminar este correo de recuperación en cualquier momento desde Ajustes.",
  "6-digit code": "Código de 6 dígitos",
  "New username (optional)": "Nuevo nombre de usuario (opcional)",
  "Password": "Contraseña",
  "New password (8+ characters)": "Nueva contraseña (8+ caracteres)",
  "Password (8+ characters)": "Contraseña (8+ caracteres)",
  "Repeat password": "Repite la contraseña",
  "GlucoShadow is not a medical device.": "GlucoShadow no es un dispositivo médico.",
  "GlucoShadow has not been tested or approved for medical use.": "GlucoShadow no ha sido probado ni aprobado para uso médico.",
  "GlucoShadow does not replace your official sensor application (such as Dexcom, Libre, Medtronic or Omnipod). You must keep the official application running, with its alarms enabled.":
    "GlucoShadow no reemplaza tu aplicación oficial del sensor (como Dexcom, Libre, Medtronic u Omnipod). Debes mantener la aplicación oficial funcionando, con sus alarmas activadas.",
  "Do not use this application for real-time decisions. Always rely on your official applications and systems before making any decision regarding your health and well-being.":
    "No uses esta aplicación para decisiones en tiempo real. Confía siempre en tus aplicaciones y sistemas oficiales antes de tomar cualquier decisión sobre tu salud y bienestar.",
  "Readings, alarms and emergency messages may be delayed, inaccurate, or may fail to be delivered, for example because of a powered-off phone, lack of signal, a Bluetooth interruption or a server outage.":
    "Las lecturas, alarmas y mensajes de emergencia pueden retrasarse, ser inexactos o no llegar, por ejemplo por un teléfono apagado, falta de señal, una interrupción de Bluetooth o una caída del servidor.",
  "The developer of this application may not be held responsible for any inconvenience caused directly or indirectly through its use.":
    "El desarrollador de esta aplicación no puede ser responsable de ningún inconveniente causado directa o indirectamente por su uso.",
  "GlucoShadow is not affiliated with, endorsed by or approved by any sensor manufacturer.": "GlucoShadow no está afiliado, respaldado ni aprobado por ningún fabricante de sensores.",
  "I have read and understood the above, and I agree. I acknowledge that this application has not been tested for medical purposes.":
    "He leído y entendido lo anterior, y acepto. Reconozco que esta aplicación no ha sido probada para fines médicos.",
  "I agree: NOT FOR ANY MEDICAL USE.": "Acepto: NO PARA USO MÉDICO.",
  "Skip": "Omitir",
  "Back to sign in": "Volver a iniciar sesión",
  "Forgot username?": "¿Olvidaste tu nombre de usuario?",
  "Forgot password?": "¿Olvidaste tu contraseña?",
  "Didn't get it? Send a new code": "¿No lo recibiste? Enviar un nuevo código",
  "Back": "Atrás",
};

const dictionaries: Record<Lang, Record<string, string>> = { en: {}, fr, es };

let lang: Lang = "en";
let loaded = false; // the stored value (or lack of one) has been read from disk
let chosen = false; // the person has picked a language, now or on an earlier launch
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export async function loadLanguage() {
  const v = (await AsyncStorage.getItem(KEY).catch(() => null)) as Lang | null;
  if (v === "en" || v === "fr" || v === "es") {
    lang = v;
    chosen = true;
  }
  loaded = true;
  notify();
}

export function setLanguage(l: Lang) {
  lang = l;
  chosen = true;
  AsyncStorage.setItem(KEY, l).catch(() => {});
  notify();
}

export const getLanguage = () => lang;
/** True once the on-disk value has been read, so the first-launch picker doesn't flash. */
export const isLanguageLoaded = () => loaded;
/** True once the person has a language set (now or from a previous launch). */
export const hasChosenLanguage = () => chosen;
export const useLanguage = () => useSyncExternalStore(subscribe, getLanguage);
export const useLanguageLoaded = () => useSyncExternalStore(subscribe, isLanguageLoaded);
export const useHasChosenLanguage = () => useSyncExternalStore(subscribe, hasChosenLanguage);

/** Translate an English UI string. Falls back to the English text itself when there's no
 * translation yet, so untranslated screens still render normally. */
export function t(key: string, l: Lang = lang): string {
  return dictionaries[l][key] ?? key;
}

/** Hook form of `t`, so a component re-renders when the language changes. */
export function useT() {
  const l = useLanguage();
  return (key: string) => t(key, l);
}
