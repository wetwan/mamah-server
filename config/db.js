import mongoose from "mongoose";

//connectv to mongodb database

const connectDB = async () => {
    mongoose.connection.on('connected' , ()=> console.log('connected'))
    await mongoose.connect(`${process.env.MONgODB_URL}/mamah`)
}

export default connectDB