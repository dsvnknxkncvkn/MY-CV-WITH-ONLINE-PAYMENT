require('dotenv').config();
const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Razorpay
// If keys are not set, it will fallback to placeholders
const key_id = process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder_key_id';
const key_secret = process.env.RAZORPAY_KEY_SECRET || 'placeholder_key_secret';

const razorpay = new Razorpay({
  key_id: key_id,
  key_secret: key_secret
});

// Endpoint to create Razorpay Order
app.post('/api/payment/order', async (req, res) => {
  try {
    const { amount } = req.body;
    const numericAmount = parseFloat(amount);

    // Backend validation: strict ₹600 limit
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid amount. Amount must be a positive number.' 
      });
    }

    if (numericAmount > 600) {
      return res.status(400).json({ 
        success: false, 
        message: 'Payment rejected. Maximum allowed payment is ₹600.' 
      });
    }

    // Convert INR to Paise (1 INR = 100 Paise)
    const amountInPaise = Math.round(numericAmount * 100);

    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: `receipt_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    };

    const order = await razorpay.orders.create(options);
    
    res.status(200).json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: key_id // Send key_id to frontend to initialize checkout
    });

  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    if (error.statusCode === 401) {
      return res.status(401).json({
        success: false,
        message: 'Razorpay authentication failed. Please update the placeholder API keys in your .env file with your actual Razorpay Test Keys.'
      });
    }
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create order. Please check server logs or API keys.',
      error: error.message 
    });
  }
});

// Endpoint to verify Razorpay Payment Signature
app.post('/api/payment/verify', (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameters for verification.' 
      });
    }

    // Generate signature using local secret key
    const shasum = crypto.createHmac('sha256', key_secret);
    shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const digest = shasum.digest('hex');

    // Secure comparison of signature
    if (digest === razorpay_signature) {
      console.log(`Payment successfully verified. Order ID: ${razorpay_order_id}, Payment ID: ${razorpay_payment_id}`);
      res.status(200).json({ 
        success: true, 
        message: 'Payment verified successfully.' 
      });
    } else {
      console.warn(`Payment verification failed. Signatures do not match.`);
      res.status(400).json({ 
        success: false, 
        message: 'Invalid payment signature. Verification failed.' 
      });
    }

  } catch (error) {
    console.error('Error during signature verification:', error);
    res.status(500).json({ 
      success: false, 
      message: 'An error occurred during verification.',
      error: error.message 
    });
  }
});

// Serve PDF file directly on a route or fallback
app.get('/download-cv', (req, res) => {
  res.download(path.join(__dirname, 'public', 'CV.pdf'), 'Somnath_Chatterjee_CV.pdf');
});

// Catch-all route to serve portfolio
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Maximum allowed payment: ₹600`);
});
