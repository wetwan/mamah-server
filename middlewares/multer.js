import multer from "multer";

const storage = multer.memoryStorage(); // store files in memory before uploading

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    files: 4,           // allow max 4 images
    fileSize: 5 * 1024 * 1024, // max 5 MB per file
  },
});

export default upload;
