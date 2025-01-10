import prisma from "../config/prisma.js";
import axios from "axios";
import removeFile from "../services/remove_file.js";
import getFileUrl from "../services/get_file_url.js";

/**
 * Handles the search functionality.
 *
 * @param {Request} req - The request object.
 * @param {Response} res - The body of the request.
 */

export const handleFileUpload = async (req, res) => {
  try {
    const { user_id } = req.body;
    const files = req.files ?? [];

    if (!user_id) {
      console.log("HANDLE_FILE_UPLOAD ERROR 400: User ID is required");
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    if (req.fileError) {
      console.log("HANDLE_FILE_UPLOAD ERROR 400: ", req.fileError);
      return res.status(400).json({
        success: false,
        message: req.fileError,
      });
    }

    if (files.length === 0) {
      console.log("HANDLE_FILE_UPLOAD ERROR 400: Files are required");
      return res.status(400).json({
        success: false,
        message: "Files are required",
      });
    }

    const dbFiles = await prisma.uploadedFile.createManyAndReturn({
      data: files.map((file, i) => ({
        userId: user_id,
        name: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: file.filename.replace(
          process.env.CLOUDINARY_FOLDER_NAME + "/",
          ""
        ),
      })),
    });

    return res.status(200).json({
      success: true,
      message: "Files uploaded",
      data: {
        files: dbFiles.map((file) => file.id),
      },
    });
  } catch (error) {
    console.log("HANDLE_FILE_UPLOAD ERROR 500: ", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server error",
    });
  }
};

export const handleSearch = async (req, res) => {
  try {
    const { user_id, query, files = [] } = req.body;

    if (!user_id) {
      console.log("HANDLE_SEARCH ERROR 400: User ID is required");
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    if (!query) {
      console.log("HANDLE_SEARCH ERROR 400: Query is required");
      return res.status(400).json({
        success: false,
        message: "Query is required",
      });
    }

    const dbFiles = await prisma.uploadedFile.findMany({
      where: {
        id: {
          in: files,
        },
      },
    });

    if (dbFiles.length !== files.length) {
      console.log("HANDLE_SEARCH ERROR 400: Invalid file id");
      return res.status(400).json({
        success: false,
        message: "Files not found",
      });
    }

    const searchResponse = await axios.post(process.env.SEARCH_API_URL, {
      message: query,
      files: dbFiles.map((file) => ({
        name: file.name,
        url: getFileUrl(file.path),
      })),
    });

    if (!searchResponse.data?.response) {
      console.log("HANDLE_SEARCH ERROR 500: Search failed");
      return res.status(500).json({
        success: false,
        message: "Search failed",
      });
    }

    const {
      response,
      summary,
      summary_2x,
      summary_3x,
      valid_sources,
      invalid_sources,
    } = searchResponse.data;

    const search = await prisma.search.create({
      data: {
        userId: user_id,
        query: query,
        summary: summary,
        summary_2x: summary_2x,
        summary_3x: summary_3x,
        validSources: {
          connectOrCreate: valid_sources.map((source) => ({
            where: { url: source.url }, // Use unique URL for `connectOrCreate`
            create: {
              title: source.title,
              url: source.url,
              type: source.doc_type.replace(/ /g, "_"), // Ensure enum compatibility
            },
          })),
        },
        invalidSources: {
          connectOrCreate: invalid_sources.map((source) => ({
            where: { url: source.url }, // Use unique URL for `connectOrCreate`
            create: {
              title: source.title,
              url: source.url,
              type: source.doc_type.replace(/ /g, "_"), // Ensure enum compatibility
            },
          })),
        },
        searchResults: {
          create: response.map((node, i) => ({
            order: i,
            content: node.content,
            highlights: node.highlight_words,
            source: {
              connectOrCreate: {
                where: { url: node.source.split("#:~:text=")[0] }, // Ensure uniqueness by splitting to base URL
                create: {
                  title: node.title,
                  url: node.source.split("#:~:text=")[0],
                  type: node.doc_type.replace(/ /g, "_"),
                },
              },
            },
          })),
        },
        attachedFiles: {
          connect: dbFiles.map((file) => ({ id: file.id })),
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: "Search successful",
      data: {
        searchId: search.id,
      },
    });
  } catch (error) {
    console.log("HANDLE_SEARCH ERROR 500: ", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server error",
    });
  }
};

export const getUserSearches = async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      console.log("GET_USER_SEARCHES ERROR 400: User ID is required");
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }
    let searches = await prisma.search.findMany({
      where: {
        userId: user_id,
      },
      select: {
        id: true,
        query: true,
        createdAt: true,
      },
    });

    searches = searches.sort((a, b) => b.createdAt - a.createdAt);

    return res.status(200).json({
      success: true,
      message: "Searches retrieved",
      data: searches,
    });
  } catch (error) {
    console.log("GET_USER_SEARCHES ERROR 500: ", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server error",
    });
  }
};

export const getUserFiles = async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      console.log("GET_USER_FILES ERROR 400: User ID is required");
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }
    const files = await prisma.uploadedFile.findMany({
      where: {
        userId: user_id,
      },
      select: {
        id: true,
        name: true,
        mimeType: true,
        size: true,
        path: true,
      },
    });
    return res.status(200).json({
      success: true,
      message: "Files retrieved",
      data: files.map((file) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        url: getFileUrl(file.path),
      })),
    });
  } catch (error) {
    console.log("GET_USER_FILES ERROR 500: ", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server error",
    });
  }
};

export const getSearchDetails = async (req, res) => {
  try {
    const { search_id } = req.params;
    if (!search_id) {
      console.log("GET_SEARCH_DETAILS ERROR 400: Search ID is required");
      return res.status(400).json({
        success: false,
        message: "Search ID is required",
      });
    }
    const search = await prisma.search.findUnique({
      where: {
        id: search_id,
      },
      include: {
        validSources: true,
        invalidSources: true,
        searchResults: {
          include: {
            source: true,
          },
        },
        attachedFiles: true,
      },
    });

    if (!search) {
      console.log("GET_SEARCH_DETAILS ERROR 404: Search not found");
      return res.status(404).json({
        success: false,
        message: "Search not found",
      });
    }

    search.searchResults.sort((a, b) => a.order - b.order);

    const searchDetails = {
      createdAt: search.createdAt,
      query: search.query,
      summaries: {
        ["1x"]: search.summary,
        ["2x"]: search.summary_2x ?? "2x Summary not available",
        ["3x"]: search.summary_3x ?? "3x Summary not available",
      },
      searchResults: search.searchResults.map((result) => ({
        content: result.content,
        highlights: result.highlights,
        title: result.source.title,
        source:
          result.source.url +
          "#:~:text=" +
          result.highlights
            .map(
              (highlight) =>
                "text=" +
                encodeURI(
                  result.content
                    .split(highlight)[0]
                    .split(" ")
                    .slice(-3)
                    .join(" ")
                    .trim() +
                    "-," +
                    highlight
                )
            )
            .join("&"),
        type: result.source.type.replaceAll("_", " "),
      })),
      validSources: search.validSources.map((source) => ({
        title: source.title,
        url: source.url,
        type: source.type
          .replaceAll("_", " ")
          .replace(
            "None",
            process.env.FILE_UPLOAD_API_URL.replace("/api/upload_files", "")
          ),
      })),
      invalidSources: search.invalidSources.map((source) => ({
        title: source.title,
        url: source.url,
        type: source.type.replaceAll("_", " "),
      })),
      attachedFiles: search.attachedFiles.map((file) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        url: getFileUrl(file.path),
      })),
    };
    return res.status(200).json({
      success: true,
      message: "Search details retrieved",
      data: searchDetails,
    });
  } catch (error) {
    console.log("GET_SEARCH_DETAILS ERROR 500: ", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server error",
    });
  }
};

export const deleteUserSearch = async (req, res) => {
  try {
    const { user_id } = req.query;
    const { search_id } = req.params;

    if (!user_id) {
      console.log("DELETE_USER_SEARCH ERROR 400: User ID is required");
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    if (!search_id) {
      console.log("DELETE_SEARCH ERROR 400: Search ID is required");
      return res.status(400).json({
        success: false,
        message: "Search ID is required",
      });
    }
    const search = await prisma.search.findUnique({
      where: {
        id: search_id,
        userId: user_id,
      },
    });

    if (!search) {
      console.log("DELETE_SEARCH ERROR 404: Search not found");
      return res.status(404).json({
        success: false,
        message: "Search not found",
      });
    }

    await prisma.searchResult.deleteMany({
      where: {
        searchId: search_id,
      },
    });

    await prisma.search.delete({
      where: {
        id: search_id,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Search deleted",
    });
  } catch (error) {
    console.log("DELETE_SEARCH ERROR 500: ", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server error",
    });
  }
};

export const deleteUserFile = async (req, res) => {
  try {
    const { user_id } = req.query;
    const { file_id } = req.params;

    if (!user_id) {
      console.log("DELETE_USER_FILE ERROR 400: User ID is required");
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    if (!file_id) {
      console.log("DELETE_USER_FILE ERROR 400: File ID is required");
      return res.status(400).json({
        success: false,
        message: "File ID is required",
      });
    }
    const file = await prisma.uploadedFile.findUnique({
      where: {
        id: file_id,
        userId: user_id,
      },
    });

    if (!file) {
      console.log("DELETE_USER_FILE ERROR 404: File not found");
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    await prisma.uploadedFile.delete({
      where: {
        id: file_id,
      },
    });

    await removeFile(file.path);

    return res.status(200).json({
      success: true,
      message: "File deleted",
    });
  } catch (error) {
    console.log("DELETE_USER_FILE ERROR 500: ", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server error",
    });
  }
};
