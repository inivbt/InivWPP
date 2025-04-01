// src/utils/validators.js

// Helper function to validate phone numbers
function validatePhoneNumber(phoneNumber) {
    const phoneRegex = /^\+\d{1,3}([\-\u2011\s]?\d+)+$/; // Accept normal or non-standard hyphens
    const sanitizedPhoneNumber = phoneNumber.replace(/[\s\-\+\u2011]/g, '');
    const sanitizedRegex = /^\d{6,15}$/; // Adjust the length as needed
    return phoneRegex.test(phoneNumber) && sanitizedRegex.test(sanitizedPhoneNumber);
}

module.exports = {
    validatePhoneNumber
};
