import multer from "multer";
import cloudinary from "../config/cloudinary.js";
import { CloudinaryStorage } from "multer-storage-cloudinary";

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: process.env.CLOUDINARY_FOLDER_NAME,
    format: "pdf",
    unique_filename: true,
    allowed_formats: ["pdf"],
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      req.fileError = "Invalid file type. Only PDF file is allowed.";
      cb(null, false);
    }
  },
});

export default upload;
