import axios from "axios";

async function testFull() {
  const phone = "0999888777";
  const password = "Password@123";
  let token = null;

  try {
    console.log("Registering user");
    const regRes = await axios.post("http://localhost:5000/api/auth/register", {
      fullName: "Test User",
      phoneNumber: phone,
      password: password,
      province: "Hanoi"
    });
    console.log("Register Success:", regRes.data.success);
  } catch (error) {
    console.log("Register error:", error.response?.data?.message || error.message);
  }

  try {
    console.log("Logging in user");
    const loginRes = await axios.post("http://localhost:5000/api/auth/login", {
      phoneNumber: phone,
      password: password
    });
    console.log("Login Success:", loginRes.data.success);
  } catch (error) {
    console.log("Login error:", error.response?.status, error.response?.data?.message || error.message);
  }
}

testFull();
