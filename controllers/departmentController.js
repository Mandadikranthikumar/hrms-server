import {
  createDepartmentService,
  getAllDepartmentsService,

  getPublicDepartmentsService,

  getDepartmentByIdService,
  updateDepartmentService,
  deleteDepartmentService,
} from "../services/departmentService.js";

export const createDepartment = async (req, res) => {
  try {
    const department = await createDepartmentService(req.body);

    res.status(201).json({
      success: true,
      message: "Department created successfully",
      data: department,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getAllDepartments = async (req, res) => {
  try {
    const departments = await getAllDepartmentsService();

    res.status(200).json({
      success: true,
      count: departments.length,
      data: departments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getPublicDepartments = async (req, res) => {
  try {
    const departments = await getPublicDepartmentsService();
    res.status(200).json({ success: true, count: departments.length, data: departments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getDepartmentById = async (req, res) => {
  try {
    const department = await getDepartmentByIdService(req.params.id);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    res.status(200).json({
      success: true,
      data: department,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateDepartment = async (req, res) => {
  try {
    const department = await updateDepartmentService(
      req.params.id,
      req.body
    );

    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Department updated successfully",
      data: department,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteDepartment = async (req, res) => {
  try {
    const department = await deleteDepartmentService(req.params.id);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Department deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};