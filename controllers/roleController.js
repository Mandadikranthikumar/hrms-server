import {
    createRoleService,
    getAllRolesService,
    getPublicRolesService,
    getRoleByIdService,
    updateRoleService,
    deleteRoleService
} from "../services/roleService.js";


export const createRole = async (req, res) => {
    try {

        if (!req.body.roleId || !req.body.roleName) {
            return res.status(400).json({
                success:false,
                message:"roleId and roleName are required"
            });
        }


        const role = await createRoleService(req.body);

        res.status(201).json({
            success:true,
            message:"Role created successfully",
            data:role
        });


    } catch(error) {

        res.status(400).json({
            success:false,
            message:error.message
        });

    }
};


// Get All Roles
export const getAllRoles = async (req, res) => {
    try {
        const roles = await getAllRolesService();

        res.status(200).json({
            success: true,
            data: roles
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getPublicRoles = async (req, res) => {
    try {
        const roles = await getPublicRolesService();
        res.status(200).json({
            success: true,
            count: roles.length,
            data: roles
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// Get Role By ID
export const getRoleById = async (req, res) => {
    try {
        const role = await getRoleByIdService(req.params.id);

        if (!role) {
            return res.status(404).json({
                success: false,
                message: "Role not found"
            });
        }

        res.status(200).json({
            success: true,
            data: role
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// Update Role
export const updateRole = async (req, res) => {
    try {
        const role = await updateRoleService(
            req.params.id,
            req.body
        );

        if (!role) {
            return res.status(404).json({
                success: false,
                message: "Role not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Role updated successfully",
            data: role
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};


// Delete Role
export const deleteRole = async (req, res) => {
    try {
        const role = await deleteRoleService(req.params.id);

        if (!role) {
            return res.status(404).json({
                success: false,
                message: "Role not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Role deleted successfully"
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};