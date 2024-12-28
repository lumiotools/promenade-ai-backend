import cloudinary from "../config/cloudinary.js";

const getFileUrl = (file_name) => {
  const url = cloudinary.url(
    process.env.CLOUDINARY_FOLDER_NAME + "/" + file_name
  );
  return url;
};

export default getFileUrl;
