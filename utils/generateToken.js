import jwt from "jsonwebtoken";

const generateToken = (id) => {
  if (!process.env.JWT_SERECT) {
    throw new Error("JWT_SERECT   is not defined in .env file");
  }

  return jwt.sign({ id }, process.env.JWT_SERECT, {
    expiresIn: "30d",
  });
};

export default generateToken;
