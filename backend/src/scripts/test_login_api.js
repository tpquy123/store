import axios from "axios";

async function testLogin() {
  try {
    const response = await axios.post("http://localhost:5000/api/auth/login", {
      phoneNumber: "0123456789", 
      password: "password123"
    });
    console.log("Success:", response.data);
  } catch (error) {
    console.error("Login failed:", error.response?.status, error.response?.data || error.message);
  }
}

testLogin();
