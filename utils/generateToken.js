import jwt from "jsonwebtoken";

const generateToken = (id) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET  is not defined in .env file");
  }

  return jwt.sign({ id }, process.env.JWT_SERECT, {
    expiresIn: "30d",
  });
};

export default generateToken;
