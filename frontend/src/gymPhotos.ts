// Real Max Energy gym photos bundled as local assets.
export const gymPhotos = [
  require("../assets/images/gym1.jpg"),
  require("../assets/images/gym2.jpg"),
  require("../assets/images/gym3.jpg"),
  require("../assets/images/gym4.jpg"),
  require("../assets/images/kickbox1.webp"),
  require("../assets/images/kickbox2.webp"),
  require("../assets/images/kids1.jpg"),
  require("../assets/images/kids2.jpg"),
  require("../assets/images/kids3.jpg"),
];

// Local override photos for team members (keyed by name).
export const teamPhotos: Record<string, any> = {
  "Jamie Blackman": require("../assets/images/jamie.jpg"),
  "Alex Honorato": require("../assets/images/alex.jpg"),
};

// Max Energy Combat Club logo (shown beside timetable classes).
export const academyLogo = require("../assets/images/combat-logo.webp");

export const gymPhotoByService: Record<string, any> = {
  gym: require("../assets/images/gym1.jpg"),
  supplements: require("../assets/images/gym4.jpg"),
};

export const loginHero = require("../assets/images/gym3.jpg");
export const aboutHero = require("../assets/images/gym2.jpg");
