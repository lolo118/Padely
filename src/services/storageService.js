import { getStorageLazy } from "../lib/firebase";

// Storage se carga recién al subir una imagen (P3-13: fuera del bundle inicial)
export const uploadImage = async (path, file) => {
  const [{ ref, uploadBytes, getDownloadURL }, storage] = await Promise.all([import("firebase/storage"), getStorageLazy()]);
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, file);
  const url = await getDownloadURL(snapshot.ref);
  return url;
};

export const uploadProfilePhoto = async (userId, file) => {
  const ext = file.name.split(".").pop();
  const path = `profile-photos/${userId}/photo.${ext}`;
  return await uploadImage(path, file);
};

export const uploadClubLogo = async (clubId, file) => {
  const ext = file.name.split(".").pop();
  const path = `club-logos/${clubId}/logo.${ext}`;
  return await uploadImage(path, file);
};

export const uploadOrgLogo = async (orgId, file) => {
  const ext = file.name.split(".").pop();
  const path = `org-logos/${orgId}/logo.${ext}`;
  return await uploadImage(path, file);
};
