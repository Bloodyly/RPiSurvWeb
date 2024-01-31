// helpers.js

// Function to determine the active class based on the current URL
function activeClass(req, url) {
    return req.path === url ? 'active' : '';
}

module.exports = {
    activeClass: activeClass
};