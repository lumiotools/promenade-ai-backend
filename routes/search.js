import { Router } from "express";
import {
  handleFileUpload,
  handleSearch,
  getUserSearches,
  getUserFiles,
  getSearchDetails,
} from "../controllers/search.js";
import file_handler from "../middlewares/file_handler.js";

const router = Router();

router.post("/upload_file", file_handler.array("file"), handleFileUpload);
router.post("/", handleSearch);
router.get("/user/:user_id", getUserSearches);
router.get("/user/:user_id/files", getUserFiles);
router.get("/:search_id", getSearchDetails);

export default router;
