import Role from "../models/Role.js";

// Create Role
export const createRoleService = async (roleData) => {

    // Check duplicate roleId or roleName
    const existingRole = await Role.findOne({
        $or: [
            { roleId: roleData.roleId },
            { roleName: roleData.roleName }
        ]
    });

    if (existingRole) {
        throw new Error("Role already exists");
    }

    return await Role.create(roleData);
};

// Get All Roles
export const getAllRolesService = async () => {
    return await Role.find().sort({ createdAt: -1 });
};

// Get Active Roles (public, minimal fields - used by Register page dropdown)
export const getPublicRolesService = async () => {
    return await Role.find({ status: "Active" })
        .select("roleId roleName")
        .sort({ roleName: 1 });
};

// Get Role By ID
export const getRoleByIdService = async (id) => {
    return await Role.findById(id);
};

// Update Role
export const updateRoleService = async (id, roleData) => {

    // Check duplicate roleId or roleName excluding current role
    const existingRole = await Role.findOne({
        _id: { $ne: id },
        $or: [
            { roleId: roleData.roleId },
            { roleName: roleData.roleName }
        ]
    });


    if (existingRole) {
        throw new Error("Role ID or Role Name already exists");
    }


    return await Role.findByIdAndUpdate(
        id,
        roleData,
        {
            returnDocument:"after",
            runValidators: true,
        }
    );
};

// Delete Role
export const deleteRoleService = async (id) => {
    return await Role.findByIdAndDelete(id);
};