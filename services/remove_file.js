import cloudinary from "../config/cloudinary.js";

const removeFile = async (file_name) => {
  try {
    await cloudinary.uploader.destroy(
      process.env.CLOUDINARY_FOLDER_NAME + "/" + file_name
    );
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};

export default removeFile;
