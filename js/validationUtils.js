export function isValidDateTimeFormat(datetimeString) {
    const regex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
    if (!regex.test(datetimeString)) {
        return false;
    }
    const parts = datetimeString.split(' ');
    const dateParts = parts[0].split('-').map(Number);
    const timeParts = parts[1].split(':').map(Number);
    const date = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1], timeParts[2]);
    return date.getFullYear() === dateParts[0] && date.getMonth() === dateParts[1] - 1 && date.getDate() === dateParts[2] &&
        date.getHours() === timeParts[0] && date.getMinutes() === timeParts[1] && date.getSeconds() === timeParts[2];
}

export function isValidUrlBase(urlBaseString) {
    const regex = /^[a-zA-Z0-9.-]+$|^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    return regex.test(urlBaseString);
}