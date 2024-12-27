import multer from "multer";
import fs from "fs";

fs.mkdirSync("uploads", { recursive: true });

export default multer({
  storage: multer.diskStorage({ destination: "uploads" }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("File type not supported"));
    }
  },
});

export const removeFile = (filename) => {
    fs.unlink(`uploads/${filename}`, (err) => {
        if (err) {
        console.error("Error removing file: ", err);
        }
    });
}