import { Router } from "express";
import {
  handleFileUpload,
  handleSearch,
  getUserSearches,
  getUserFiles,
  getSearchDetails,
  deleteUserFile,
  deleteUserSearch
} from "../controllers/search.js";
import file_upload from "../middlewares/file_upload.js";

const router = Router();

router.post("/upload_files", file_upload.array("file"), handleFileUpload);
router.post("/", handleSearch);
router.get("/user", getUserSearches);
router.get("/files", getUserFiles);
router.get("/:search_id", getSearchDetails);
router.delete("/file/:file_id", deleteUserFile);
router.delete("/:search_id", deleteUserSearch);

export default router;
