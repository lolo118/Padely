import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../lib/firebase";

export const uploadImage = async (path, file) => {
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
